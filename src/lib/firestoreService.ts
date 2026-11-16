import { supabase } from './supabase';
import { coalesce } from './bulkWrite';

export interface ExpiryRecord {
  id: string;
  expDate: string;
  destructionDate: string;
  quantity?: number;
  note?: string;
  createdAt: string;
}

export interface Product {
  id?: number | string;
  userId?: string;
  barcode: string;
  internalCode?: string;
  name: string;
  mfgDate?: string;
  destructionDate?: string;
  destroyDaysBeforeExpiry?: number;
  price: number;
  expiryRecords?: ExpiryRecord[];
  createdAt?: string;
  updatedAt?: string;
  tracked?: boolean;
}

const TABLE_NAME = 'products';

export const sanitizeExpiryRecord = (rec: Partial<ExpiryRecord>): ExpiryRecord => {
  const clean: ExpiryRecord = {
    id: rec.id || ('rec-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6)),
    expDate: rec.expDate || '',
    destructionDate: rec.destructionDate || rec.expDate || '',
    createdAt: rec.createdAt || new Date().toISOString()
  };
  if (rec.quantity !== undefined && rec.quantity !== null && !isNaN(Number(rec.quantity)) && Number(rec.quantity) > 0) {
    clean.quantity = Number(rec.quantity);
  }
  if (rec.note && typeof rec.note === 'string' && rec.note.trim()) {
    clean.note = rec.note.trim();
  }
  return clean;
};

export const buildProductPayload = (product: Omit<Product, 'id'>, userId: string, docId?: string): Record<string, any> => {
  const rawRecords = product.expiryRecords || [];
  const cleanedRecords = rawRecords.map(sanitizeExpiryRecord).sort(
    (a, b) => new Date(a.destructionDate).getTime() - new Date(b.destructionDate).getTime()
  );

  const destructionDate = product.destructionDate || (cleanedRecords.length > 0 ? cleanedRecords[0].destructionDate : '');
  const barcodeTrimmed = (product.barcode || '').trim();
  const stableId = docId || (barcodeTrimmed ? ('bc_' + barcodeTrimmed) : ('prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)));

  const payload: Record<string, any> = {
    id: stableId,
    assignedUser: userId || (product as any).assignedUser || product.userId || 'shared',
    barcode: barcodeTrimmed,
    name: product.name || '',
    price: Number(product.price) || 0,
    destroyDaysBeforeExpiry: product.destroyDaysBeforeExpiry ?? 0,
    destructionDate: destructionDate,
    expiryRecords: cleanedRecords,
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (product.internalCode && String(product.internalCode).trim()) {
    payload.internalCode = String(product.internalCode).trim();
  }

  return payload;
};

export const fetchAllProducts = async (chunkSize = 1000): Promise<Product[]> => {
  const all: Product[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const to = from + chunkSize - 1;
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('name', { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (data && data.length > 0) {
      all.push(...(data as Product[]));
      from += chunkSize;
      if (data.length < chunkSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  return all;
};

export const subscribeProducts = (
  userId: string,
  onData: (products: Product[]) => void,
  onError?: (error: Error) => void
) => {
  let isCancelled = false;

  const loadData = async () => {
    try {
      const [trackedRes, generalRes, expiryRes] = await Promise.all([
        supabase
          .from(TABLE_NAME)
          .select('*')
          .neq('destructionDate', '')
          .order('destructionDate', { ascending: true }),
        supabase
          .from(TABLE_NAME)
          .select('*')
          .eq('destructionDate', '')
          .limit(1000),
        supabase
          .from('product_expiry')
          .select('barcode, exp_date, destroy_days')
      ]);

      if (generalRes.error && trackedRes.error) throw generalRes.error;
      if (isCancelled) return;

      const expiryTableMap = new Map<string, { exp_date: string; destroy_days: number }>();
      if (!expiryRes.error && Array.isArray(expiryRes.data)) {
        expiryRes.data.forEach((row: any) => {
          const bc = String(row.barcode || '').trim();
          if (bc && row.exp_date) {
            expiryTableMap.set(bc, {
              exp_date: String(row.exp_date),
              destroy_days: Number(row.destroy_days) || 0
            });
          }
        });
      }

      const combinedMap = new Map<string, any>();
      (trackedRes.data || []).forEach((row: any) => {
        combinedMap.set(String(row.id || row.barcode), row);
      });
      (generalRes.data || []).forEach((row: any) => {
        const key = String(row.id || row.barcode);
        if (!combinedMap.has(key)) {
          combinedMap.set(key, row);
        }
      });

      const list = Array.from(combinedMap.values()).map((row: any) => {
        const bc = String(row.barcode || '').trim();
        const extExpiry = expiryTableMap.get(bc);
        let destructionDate = row.destructionDate || '';
        let destroyDays = row.destroyDaysBeforeExpiry ?? 0;
        let expiryRecords = row.expiryRecords || [];

        if (extExpiry) {
          destroyDays = extExpiry.destroy_days;
          const d = new Date(extExpiry.exp_date);
          if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() - destroyDays);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            destructionDate = `${y}-${m}-${day}`;
            expiryRecords = [
              {
                id: 'rec-' + (row.id || bc),
                expDate: extExpiry.exp_date,
                destructionDate,
                createdAt: new Date().toISOString()
              }
            ];
          }
        }

        return {
          ...row,
          userId: row.assignedUser || row.userId || 'shared',
          tracked: Boolean(destructionDate),
          destructionDate,
          destroyDaysBeforeExpiry: destroyDays,
          expiryRecords
        };
      }) as Product[];

      const normalized = list.map(p => {
        if (!p.expiryRecords || p.expiryRecords.length === 0) {
          if (p.destructionDate) {
            return {
              ...p,
              expiryRecords: [{
                id: 'rec-' + (p.id || 'init') + '-1',
                expDate: p.destructionDate,
                destructionDate: p.destructionDate,
                createdAt: new Date().toISOString()
              }]
            };
          }
        }
        return p;
      });

      try {
        localStorage.setItem('cached_live_products', JSON.stringify(normalized.slice(0, 200)));
      } catch {}

      onData(normalized);
    } catch (err: any) {
      if (isCancelled) return;
      try {
        const cached = localStorage.getItem('cached_live_products');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            onData(parsed);
          }
        }
      } catch {}
      if (onError) onError(err);
    }
  };

  const throttled = coalesce(() => {
    if (!isCancelled) loadData();
  }, 400);

  loadData();

  const channel = supabase
    .channel('products-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE_NAME },
      () => {
        throttled.push(true);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'product_expiry' },
      () => {
        throttled.push(true);
      }
    )
    .subscribe();

  return () => {
    isCancelled = true;
    throttled.cancel();
    supabase.removeChannel(channel);
  };
};

export const addProductOnline = async (product: Omit<Product, 'id'>, userId: string): Promise<string> => {
  const payload = buildProductPayload(product, userId);
  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert(payload, { onConflict: 'id' });
  if (error) throw error;

  if (payload.barcode && payload.expiryRecords && payload.expiryRecords.length > 0) {
    try {
      await supabase
        .from('product_expiry')
        .upsert(
          {
            barcode: payload.barcode,
            exp_date: payload.expiryRecords[0].expDate || payload.destructionDate,
            destroy_days: Number(payload.destroyDaysBeforeExpiry) || 0
          },
          { onConflict: 'barcode' }
        );
    } catch {}
  }

  return payload.id;
};

export const addProductsBulk = async (
  products: Omit<Product, 'id'>[],
  userId: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> => {
  const total = products.length;
  if (total === 0) return 0;

  const BATCH_SIZE = 500;
  let done = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE);
    const payloads = chunk.map(p => buildProductPayload(p, userId));
    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(payloads, { onConflict: 'id' });

    if (error) throw error;

    done += chunk.length;
    onProgress?.(Math.min(done, total), total);
  }

  return total;
};

export const updateProductOnline = async (product: Product): Promise<void> => {
  if (!product.id) return;

  const rawRecords = product.expiryRecords || [];
  const cleanedRecords = rawRecords.map(sanitizeExpiryRecord).sort(
    (a, b) => new Date(a.destructionDate).getTime() - new Date(b.destructionDate).getTime()
  );

  const destructionDate = product.destructionDate || (cleanedRecords.length > 0 ? cleanedRecords[0].destructionDate : '');

  const payload: Record<string, any> = {
    barcode: product.barcode || '',
    name: product.name || '',
    price: Number(product.price) || 0,
    destroyDaysBeforeExpiry: product.destroyDaysBeforeExpiry ?? 0,
    destructionDate: destructionDate,
    expiryRecords: cleanedRecords,
    updatedAt: new Date().toISOString()
  };

  if (product.userId) payload.assignedUser = product.userId;
  if (product.internalCode !== undefined && product.internalCode !== null) {
    const trimmed = String(product.internalCode).trim();
    if (trimmed) payload.internalCode = trimmed;
  }

  const { error } = await supabase
    .from(TABLE_NAME)
    .update(payload)
    .eq('id', String(product.id));

  if (error) throw error;

  const bc = (product.barcode || '').trim();
  if (bc) {
    try {
      if (cleanedRecords.length > 0) {
        await supabase
          .from('product_expiry')
          .upsert(
            {
              barcode: bc,
              exp_date: cleanedRecords[0].expDate || destructionDate,
              destroy_days: Number(product.destroyDaysBeforeExpiry) || 0
            },
            { onConflict: 'barcode' }
          );
      } else {
        await supabase
          .from('product_expiry')
          .delete()
          .eq('barcode', bc);
      }
    } catch {}
  }
};

export const deleteProductOnline = async (id: string | number): Promise<void> => {
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', String(id));
  if (error) throw error;
};

export const clearProductsCollection = async () => {
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .neq('id', '');
  if (error) throw error;
};

export const syncFromLocalToOnline = async (localProducts: Product[], targetUserId: string) => {
  if (!localProducts || localProducts.length === 0) return 0;
  return await addProductsBulk(localProducts, targetUserId);
};
