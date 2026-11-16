import { supabase } from './supabase';
import { Product } from './firestoreService';

export interface FillItem {
  id: string;
  barcode: string;
  product_name: string;
  internal_code?: string | null;
  quantity: number;
  updated_at: string;
}

const BOXES_TABLE = 'boxes';
const FILL_PREFIX = 'fill_';
const FILL_CREATOR_TAG = 'fill_hang';
const LOCAL_FILL_CACHE_KEY = 'fill_hang_items_v1';

const getLocalFillItems = (): FillItem[] => {
  try {
    const raw = localStorage.getItem(LOCAL_FILL_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalFillItems = (items: FillItem[]) => {
  try {
    localStorage.setItem(LOCAL_FILL_CACHE_KEY, JSON.stringify(items));
  } catch {}
};

export const resolveProductForFill = async (
  rawBarcode: string,
  localProducts: Product[] = []
): Promise<{ name: string; barcode: string; internalCode?: string | null } | null> => {
  const clean = rawBarcode.trim();
  if (!clean) return null;
  const cleanLower = clean.toLowerCase();
  const noZero = cleanLower.replace(/^0+/, '');

  try {
    const { data: exactMatch } = await supabase
      .from('products')
      .select('id, name, barcode, internalCode')
      .eq('barcode', clean)
      .limit(1)
      .maybeSingle();

    if (exactMatch && exactMatch.name) {
      return {
        name: String(exactMatch.name).trim(),
        barcode: String(exactMatch.barcode || clean).trim(),
        internalCode: exactMatch.internalCode ? String(exactMatch.internalCode).trim() : null
      };
    }

    const { data: internalMatch } = await supabase
      .from('products')
      .select('id, name, barcode, internalCode')
      .eq('internalCode', clean)
      .limit(1)
      .maybeSingle();

    if (internalMatch && internalMatch.name) {
      return {
        name: String(internalMatch.name).trim(),
        barcode: String(internalMatch.barcode || clean).trim(),
        internalCode: internalMatch.internalCode ? String(internalMatch.internalCode).trim() : null
      };
    }
  } catch {}

  const localFound = localProducts.find(p => {
    const b = (p.barcode || '').trim().toLowerCase();
    const i = (p.internalCode || '').trim().toLowerCase();
    return (
      b === cleanLower ||
      i === cleanLower ||
      (noZero && (b.replace(/^0+/, '') === noZero || i.replace(/^0+/, '') === noZero))
    );
  });

  if (localFound) {
    return {
      name: localFound.name,
      barcode: localFound.barcode || clean,
      internalCode: localFound.internalCode || null
    };
  }

  return null;
};

export const fetchFillItems = async (): Promise<FillItem[]> => {
  const localList = getLocalFillItems();
  const map = new Map<string, FillItem>();

  localList.forEach(item => {
    if (item.barcode) {
      map.set(item.barcode, item);
    }
  });

  try {
    const { data, error } = await supabase
      .from(BOXES_TABLE)
      .select('*')
      .eq('createdBy', FILL_CREATOR_TAG)
      .order('updatedAt', { ascending: false });

    if (!error && data) {
      const remoteList: FillItem[] = [];
      data.forEach((row: any) => {
        const barcode = String(row.boxNumber || String(row.id || '').replace(/^fill_/, '')).trim();
        const qty = parseInt(String(row.note || '0'), 10);
        if (barcode && qty > 0) {
          const item: FillItem = {
            id: String(row.id),
            barcode,
            product_name: String(row.title || barcode).trim(),
            quantity: qty,
            updated_at: String(row.updatedAt || row.createdAt || new Date().toISOString())
          };
          remoteList.push(item);
          map.set(barcode, item);
        }
      });

      if (data.length > 0 || localList.length === 0) {
        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        saveLocalFillItems(merged);
        return merged;
      }
    }
  } catch {}

  const result = Array.from(map.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  return result;
};

export const saveFillItemOnline = async (
  product: { name: string; barcode: string; internalCode?: string | null },
  quantity: number
): Promise<FillItem> => {
  const cleanBarcode = product.barcode.trim();
  const cleanQty = Math.max(1, Number(quantity) || 1);
  const now = new Date().toISOString();
  const rowId = `${FILL_PREFIX}${cleanBarcode}`;

  const existingLocal = getLocalFillItems();
  const existingItem = existingLocal.find(i => i.barcode === cleanBarcode);
  const finalQty = existingItem ? existingItem.quantity + cleanQty : cleanQty;

  const newItem: FillItem = {
    id: rowId,
    barcode: cleanBarcode,
    product_name: product.name.trim(),
    internal_code: product.internalCode || null,
    quantity: finalQty,
    updated_at: now
  };

  const nextLocal = [newItem, ...existingLocal.filter(i => i.barcode !== cleanBarcode)];
  saveLocalFillItems(nextLocal);

  try {
    await supabase.from(BOXES_TABLE).upsert(
      {
        id: rowId,
        boxNumber: cleanBarcode,
        title: product.name.trim(),
        note: String(finalQty),
        createdBy: FILL_CREATOR_TAG,
        createdAt: now,
        updatedAt: now
      },
      { onConflict: 'id' }
    );
  } catch {}

  return newItem;
};

export const updateFillItemQuantityOnline = async (
  barcode: string,
  newQuantity: number
): Promise<void> => {
  const cleanBarcode = barcode.trim();
  if (newQuantity <= 0) {
    await deleteFillItemOnline(cleanBarcode);
    return;
  }

  const now = new Date().toISOString();
  const rowId = `${FILL_PREFIX}${cleanBarcode}`;
  const existingLocal = getLocalFillItems();
  const target = existingLocal.find(i => i.barcode === cleanBarcode);

  if (target) {
    const updated: FillItem = { ...target, quantity: newQuantity, updated_at: now };
    saveLocalFillItems(existingLocal.map(i => (i.barcode === cleanBarcode ? updated : i)));
  }

  try {
    await supabase
      .from(BOXES_TABLE)
      .update({
        note: String(newQuantity),
        updatedAt: now
      })
      .eq('id', rowId);
  } catch {}
};

export const deleteFillItemOnline = async (barcode: string): Promise<void> => {
  const cleanBarcode = barcode.trim();
  const rowId = `${FILL_PREFIX}${cleanBarcode}`;
  const nextLocal = getLocalFillItems().filter(i => i.barcode !== cleanBarcode && i.id !== cleanBarcode);
  saveLocalFillItems(nextLocal);

  try {
    await supabase.from(BOXES_TABLE).delete().eq('id', rowId);
  } catch {}
};

export const deleteAllFillItemsOnline = async (): Promise<void> => {
  const current = getLocalFillItems();
  const ids = current.map(i => i.id);
  saveLocalFillItems([]);

  try {
    await supabase.from(BOXES_TABLE).delete().eq('createdBy', FILL_CREATOR_TAG);
    if (ids.length > 0) {
      await supabase.from(BOXES_TABLE).delete().in('id', ids);
    }
  } catch {}
};

export const subscribeFillItems = (onData: (items: FillItem[]) => void) => {
  let isCancelled = false;

  const load = async () => {
    const list = await fetchFillItems();
    if (!isCancelled) {
      onData(list);
    }
  };

  load();

  const channel = supabase
    .channel('fill-hang-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: BOXES_TABLE },
      () => {
        if (!isCancelled) load();
      }
    )
    .subscribe();

  return () => {
    isCancelled = true;
    supabase.removeChannel(channel);
  };
};
