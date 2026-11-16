import { supabase } from './supabase';
import { Product } from './firestoreService';

export interface DisposalTemplateItem {
  barcode: string;
  name: string;
  stt: number;
}

export interface ResolvedDisposalProduct {
  name: string;
  barcode: string;
  internal_code: string | null;
  form_stt: number | null;
  source: 'template' | 'products' | 'manual';
}

export interface DisposalRecord {
  id: string;
  created_at: string;
  total_items: number;
  total_quantity: number;
}

export interface DisposalRecordItem {
  id?: string;
  record_id?: string;
  product_name: string;
  internal_code?: string | null;
  barcode: string;
  quantity: number;
  form_stt?: number | null;
}

const TEMPLATE_TABLE = 'disposal_template';
const RECORDS_TABLE = 'disposal_records';
const ITEMS_TABLE = 'disposal_record_items';
const LOCAL_RECORDS_KEY = 'disposal_local_records_v1';
const TEMPLATE_CACHE_KEY = 'disposal_template_cache_v1';

interface LocalStoredRecord extends DisposalRecord {
  items: DisposalRecordItem[];
}

const getLocalRecords = (): LocalStoredRecord[] => {
  try {
    const raw = localStorage.getItem(LOCAL_RECORDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalRecords = (records: LocalStoredRecord[]) => {
  try {
    localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
  } catch {}
};

export const formatBarcodeDisplay = (rawCode?: string | null): string => {
  if (!rawCode) return '';
  const clean = String(rawCode).replace(/\s+/g, '');
  
  if (clean.length === 13) {
    return `${clean.slice(0, 5)} ${clean.slice(5, 9)} ${clean.slice(9)}`;
  }
  if (clean.length === 8) {
    return `${clean.slice(0, 4)} ${clean.slice(4)}`;
  }
  if (clean.length === 7) {
    return `${clean.slice(0, 4)} ${clean.slice(4)}`;
  }
  if (clean.length === 6) {
    return `${clean.slice(0, 3)} ${clean.slice(3)}`;
  }
  if (clean.length === 12) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8)}`;
  }
  if (clean.length > 8) {
    const half = Math.ceil(clean.length / 2);
    return `${clean.slice(0, half)} ${clean.slice(half)}`;
  }
  if (clean.length > 4) {
    const half = Math.floor(clean.length / 2);
    return `${clean.slice(0, half)} ${clean.slice(half)}`;
  }
  return clean;
};

export const fetchDisposalTemplates = async (): Promise<DisposalTemplateItem[]> => {
  try {
    const { data, error } = await supabase
      .from(TEMPLATE_TABLE)
      .select('barcode, name, stt')
      .order('stt', { ascending: true });

    if (!error && data && data.length > 0) {
      const list = data.map((row: any) => ({
        barcode: String(row.barcode || '').trim(),
        name: String(row.name || '').trim(),
        stt: Number(row.stt)
      }));
      try {
        localStorage.setItem(TEMPLATE_CACHE_KEY, JSON.stringify(list));
      } catch {}
      return list;
    }
  } catch (err) {
    console.warn('fetchDisposalTemplates:', err);
  }

  try {
    const cached = localStorage.getItem(TEMPLATE_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}

  return [];
};

const findTemplateByCode = (code: string, templates: DisposalTemplateItem[]): DisposalTemplateItem | undefined => {
  const clean = code.trim().toLowerCase();
  if (!clean) return undefined;
  const exact = templates.find(t => t.barcode.trim().toLowerCase() === clean);
  if (exact) return exact;

  const noZero = clean.replace(/^0+/, '');
  if (!noZero) return undefined;
  return templates.find(t => t.barcode.trim().toLowerCase().replace(/^0+/, '') === noZero);
};

export const resolveDisposalProductByCode = async (
  rawInput: string,
  templates: DisposalTemplateItem[],
  localProducts: Product[] = [],
  allowNameMatch: boolean = true
): Promise<ResolvedDisposalProduct | null> => {
  const clean = rawInput.trim();
  const cleanLower = clean.toLowerCase();
  const noZero = cleanLower.replace(/^0+/, '');
  if (!clean) return null;

  let activeTemplates = templates;
  if (activeTemplates.length === 0) {
    activeTemplates = await fetchDisposalTemplates();
  }

  const matchedTemplateByCode = findTemplateByCode(clean, activeTemplates);
  if (matchedTemplateByCode) {
    return {
      name: matchedTemplateByCode.name,
      barcode: matchedTemplateByCode.barcode,
      internal_code: matchedTemplateByCode.barcode,
      form_stt: matchedTemplateByCode.stt,
      source: 'template'
    };
  }

  let matchedProduct: Product | null = null;

  try {
    const { data: primaryData } = await supabase
      .from('products')
      .select('id, name, barcode, internalCode')
      .eq('barcode', clean)
      .limit(1)
      .maybeSingle();

    if (primaryData) {
      matchedProduct = primaryData as Product;
    } else {
      const { data: internalData } = await supabase
        .from('products')
        .select('id, name, barcode, internalCode')
        .eq('internalCode', clean)
        .limit(1)
        .maybeSingle();

      if (internalData) {
        matchedProduct = internalData as Product;
      }
    }
  } catch (err) {
    console.warn('resolveDisposalProductByCode products query note:', err);
  }

  if (!matchedProduct && localProducts.length > 0) {
    matchedProduct = localProducts.find(p => {
      const b = (p.barcode || '').trim().toLowerCase();
      const i = (p.internalCode || '').trim().toLowerCase();
      return b === cleanLower || i === cleanLower || (noZero && (b.replace(/^0+/, '') === noZero || i.replace(/^0+/, '') === noZero));
    }) || null;
  }

  if (matchedProduct) {
    const linkedTemplate =
      (matchedProduct.internalCode ? findTemplateByCode(matchedProduct.internalCode, activeTemplates) : undefined) ||
      (matchedProduct.barcode ? findTemplateByCode(matchedProduct.barcode, activeTemplates) : undefined);

    if (linkedTemplate) {
      return {
        name: linkedTemplate.name || matchedProduct.name,
        barcode: matchedProduct.barcode || linkedTemplate.barcode,
        internal_code: matchedProduct.internalCode || linkedTemplate.barcode,
        form_stt: linkedTemplate.stt,
        source: 'template'
      };
    }

    return {
      name: matchedProduct.name,
      barcode: matchedProduct.barcode || clean,
      internal_code: matchedProduct.internalCode || null,
      form_stt: null,
      source: 'products'
    };
  }

  if (allowNameMatch) {
    const tplByName = activeTemplates.find(t => t.name.toLowerCase() === cleanLower) ||
      activeTemplates.find(t => t.name.toLowerCase().includes(cleanLower));
    if (tplByName) {
      return {
        name: tplByName.name,
        barcode: tplByName.barcode,
        internal_code: tplByName.barcode,
        form_stt: tplByName.stt,
        source: 'template'
      };
    }

    try {
      const sanitized = clean.replace(/[%_]/g, '');
      if (sanitized) {
        const { data: prodByName } = await supabase
          .from('products')
          .select('id, name, barcode, internalCode')
          .ilike('name', `%${sanitized}%`)
          .limit(1)
          .maybeSingle();

        if (prodByName) {
          const linkedTemplate =
            (prodByName.internalCode ? findTemplateByCode(prodByName.internalCode, activeTemplates) : undefined) ||
            (prodByName.barcode ? findTemplateByCode(prodByName.barcode, activeTemplates) : undefined);

          return {
            name: linkedTemplate?.name || prodByName.name,
            barcode: prodByName.barcode || clean,
            internal_code: prodByName.internalCode || linkedTemplate?.barcode || null,
            form_stt: linkedTemplate ? linkedTemplate.stt : null,
            source: linkedTemplate ? 'template' : 'products'
          };
        }
      }
    } catch (err) {
      console.warn('resolveDisposalProductByCode name query note:', err);
    }

    const localByName = localProducts.find(p => (p.name || '').toLowerCase().includes(cleanLower));
    if (localByName) {
      return {
        name: localByName.name,
        barcode: localByName.barcode,
        internal_code: localByName.internalCode || null,
        form_stt: null,
        source: 'products'
      };
    }
  }

  return null;
};

export const searchDisposalSuggestions = async (
  rawTerm: string,
  templates: DisposalTemplateItem[],
  localProducts: Product[] = []
): Promise<ResolvedDisposalProduct[]> => {
  const term = rawTerm.trim();
  const termLower = term.toLowerCase();
  if (!term || term.length < 2) return [];

  const suggestions: ResolvedDisposalProduct[] = [];
  const seenKeys = new Set<string>();

  templates.forEach(t => {
    const bMatch = t.barcode.toLowerCase().includes(termLower);
    const nMatch = t.name.toLowerCase().includes(termLower);
    if (bMatch || nMatch) {
      const key = t.barcode.trim().toLowerCase();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        seenKeys.add(t.name.trim().toLowerCase());
        suggestions.push({
          name: t.name,
          barcode: t.barcode,
          internal_code: t.barcode,
          form_stt: t.stt,
          source: 'template'
        });
      }
    }
  });

  let remoteProducts: Product[] = [];
  try {
    const safeTerm = term.replace(/[,()%_]/g, '').trim();
    if (safeTerm.length >= 2) {
      const { data } = await supabase
        .from('products')
        .select('id, name, barcode, internalCode')
        .or(`name.ilike.%${safeTerm}%,barcode.ilike.%${safeTerm}%,internalCode.ilike.%${safeTerm}%`)
        .order('name', { ascending: true })
        .limit(15);

      if (data) {
        remoteProducts = data as Product[];
      }
    }
  } catch (err) {
    console.warn('searchDisposalSuggestions query note:', err);
  }

  const combinedProducts = remoteProducts.length > 0 ? remoteProducts : localProducts;

  combinedProducts.forEach(p => {
    const bMatch = (p.barcode || '').toLowerCase().includes(termLower);
    const iMatch = (p.internalCode || '').toLowerCase().includes(termLower);
    const nMatch = (p.name || '').toLowerCase().includes(termLower);

    if (bMatch || iMatch || nMatch) {
      const codeKey = (p.internalCode || p.barcode || p.name || '').trim().toLowerCase();
      const nameKey = (p.name || '').trim().toLowerCase();
      if (!seenKeys.has(codeKey) && !seenKeys.has(nameKey)) {
        seenKeys.add(codeKey);
        if (nameKey) seenKeys.add(nameKey);

        const linkedTemplate =
          (p.internalCode ? findTemplateByCode(p.internalCode, templates) : undefined) ||
          (p.barcode ? findTemplateByCode(p.barcode, templates) : undefined);

        suggestions.push({
          name: p.name,
          barcode: p.barcode,
          internal_code: p.internalCode || null,
          form_stt: linkedTemplate ? linkedTemplate.stt : null,
          source: linkedTemplate ? 'template' : 'products'
        });
      }
    }
  });

  return suggestions.slice(0, 12);
};

export const fetchDisposalRecords = async (): Promise<DisposalRecord[]> => {
  const localList = getLocalRecords();
  const recordsMap = new Map<string, DisposalRecord>();

  localList.forEach(r => {
    recordsMap.set(r.id, {
      id: r.id,
      created_at: r.created_at,
      total_items: r.total_items,
      total_quantity: r.total_quantity
    });
  });

  try {
    const { data, error } = await supabase
      .from(RECORDS_TABLE)
      .select('id, created_at, total_items, total_quantity')
      .order('created_at', { ascending: false });

    if (!error && data) {
      data.forEach((r: any) => recordsMap.set(r.id, r));
    }
  } catch (err) {
    console.warn('fetchDisposalRecords error:', err);
  }

  const all = Array.from(recordsMap.values());
  all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return all;
};

export const deduplicateItemsList = (items: DisposalRecordItem[]): DisposalRecordItem[] => {
  if (!items || items.length === 0) return [];
  const map = new Map<string, DisposalRecordItem>();
  for (const it of items) {
    const key = (it.internal_code || it.barcode || it.product_name).trim().toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...it, quantity: Number(it.quantity) || 1 });
    } else {
      existing.quantity = Math.max(Number(existing.quantity) || 1, Number(it.quantity) || 1);
      if (!existing.id && it.id) {
        existing.id = it.id;
      }
      if ((existing.form_stt === null || existing.form_stt === undefined) && it.form_stt !== null && it.form_stt !== undefined) {
        existing.form_stt = it.form_stt;
      }
    }
  }
  return Array.from(map.values());
};

export const fetchDisposalRecordItems = async (recordId: string): Promise<DisposalRecordItem[]> => {
  try {
    const { data, error } = await supabase
      .from(ITEMS_TABLE)
      .select('id, record_id, product_name, internal_code, barcode, quantity, form_stt')
      .eq('record_id', recordId);

    if (!error && data && data.length > 0) {
      return deduplicateItemsList(data);
    }
  } catch (err) {
    console.warn('fetchDisposalRecordItems error:', err);
  }

  const localRecord = getLocalRecords().find(r => r.id === recordId);
  if (localRecord && localRecord.items) {
    return deduplicateItemsList(localRecord.items);
  }

  return [];
};

export const fetchAllDisposalRecordItems = async (): Promise<Record<string, DisposalRecordItem[]>> => {
  const map: Record<string, DisposalRecordItem[]> = {};

  try {
    const { data, error } = await supabase
      .from(ITEMS_TABLE)
      .select('id, record_id, product_name, internal_code, barcode, quantity, form_stt');

    if (!error && data && data.length > 0) {
      data.forEach((it: any) => {
        if (!it.record_id) return;
        if (!map[it.record_id]) map[it.record_id] = [];
        map[it.record_id].push(it);
      });
    }
  } catch (err) {
    console.warn('fetchAllDisposalRecordItems error:', err);
  }

  const localList = getLocalRecords();
  localList.forEach(r => {
    if (r.id && r.items && (!map[r.id] || map[r.id].length === 0)) {
      map[r.id] = r.items;
    }
  });

  const cleanMap: Record<string, DisposalRecordItem[]> = {};
  Object.keys(map).forEach(recId => {
    cleanMap[recId] = deduplicateItemsList(map[recId]);
  });

  const sanitizedLocal = localList.map(r => ({
    ...r,
    items: cleanMap[r.id] || deduplicateItemsList(r.items || [])
  }));
  saveLocalRecords(sanitizedLocal);

  return cleanMap;
};

export const saveDisposalRecordOnline = async (items: DisposalRecordItem[]): Promise<DisposalRecord> => {
  if (!items || items.length === 0) {
    throw new Error('Danh sách hàng hủy rỗng');
  }

  const cleanItems = deduplicateItemsList(items);
  const totalItems = cleanItems.length;
  const totalQuantity = cleanItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const now = new Date().toISOString();
  const localId = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  try {
    const { data: recordData, error: recordError } = await supabase
      .from(RECORDS_TABLE)
      .insert([
        {
          total_items: totalItems,
          total_quantity: totalQuantity
        }
      ])
      .select('id, created_at, total_items, total_quantity')
      .single();

    if (!recordError && recordData) {
      const realId = recordData.id;
      const itemsPayload = cleanItems.map((item) => ({
        record_id: realId,
        product_name: item.product_name,
        internal_code: item.internal_code || null,
        barcode: item.barcode,
        quantity: Number(item.quantity) || 1,
        form_stt: item.form_stt !== undefined ? item.form_stt : null
      }));

      const { data: insertedItems, error: itemsError } = await supabase
        .from(ITEMS_TABLE)
        .insert(itemsPayload)
        .select('id, record_id, product_name, internal_code, barcode, quantity, form_stt');

      const existingLocal = getLocalRecords().filter(r => r.id !== localId && r.id !== realId);
      saveLocalRecords([
        {
          id: realId,
          created_at: recordData.created_at,
          total_items: totalItems,
          total_quantity: totalQuantity,
          items: insertedItems && insertedItems.length > 0 ? insertedItems : itemsPayload
        },
        ...existingLocal
      ]);

      return recordData;
    }
  } catch (err) {
    console.warn('Supabase sync note:', err);
  }

  const localRecord: LocalStoredRecord = {
    id: localId,
    created_at: now,
    total_items: totalItems,
    total_quantity: totalQuantity,
    items: cleanItems.map(it => ({ ...it, record_id: localId }))
  };

  const existingLocal = getLocalRecords().filter(r => r.id !== localId);
  saveLocalRecords([localRecord, ...existingLocal]);

  return {
    id: localId,
    created_at: now,
    total_items: totalItems,
    total_quantity: totalQuantity
  };
};

export const deleteDisposalRecordOnline = async (recordId: string): Promise<void> => {
  const nextLocal = getLocalRecords().filter(r => r.id !== recordId);
  saveLocalRecords(nextLocal);

  try {
    await supabase
      .from(ITEMS_TABLE)
      .delete()
      .eq('record_id', recordId);
  } catch (err) {
    console.warn('delete items note:', err);
  }

  try {
    await supabase
      .from(RECORDS_TABLE)
      .delete()
      .eq('id', recordId);
  } catch (err) {
    console.warn('deleteDisposalRecordOnline error:', err);
  }
};

export const deleteAllDisposalRecordsOnline = async (recordIds: string[] = []): Promise<void> => {
  const localIds = getLocalRecords().map(r => r.id);
  const allIds = Array.from(new Set([...recordIds, ...localIds])).filter(Boolean);
  saveLocalRecords([]);

  try {
    if (allIds.length > 0) {
      await supabase
        .from(ITEMS_TABLE)
        .delete()
        .in('record_id', allIds);
    }
    await supabase
      .from(ITEMS_TABLE)
      .delete()
      .not('record_id', 'is', null);
  } catch (err) {
    console.warn('deleteAllDisposalRecordsOnline items note:', err);
  }

  try {
    if (allIds.length > 0) {
      await supabase
        .from(RECORDS_TABLE)
        .delete()
        .in('id', allIds);
    }
    await supabase
      .from(RECORDS_TABLE)
      .delete()
      .not('id', 'is', null);
  } catch (err) {
    console.warn('deleteAllDisposalRecordsOnline records note:', err);
  }
};

export const mergeAllDisposalRecordsOnline = async (
  records: DisposalRecord[],
  recordItemsMap: Record<string, DisposalRecordItem[]>
): Promise<{ record: DisposalRecord; items: DisposalRecordItem[] } | null> => {
  if (!records || records.length === 0) return null;

  const latestMap = { ...recordItemsMap };
  const missingIds = records.filter(r => !latestMap[r.id] || latestMap[r.id].length === 0).map(r => r.id);
  if (missingIds.length > 0) {
    const fetchedAll = await fetchAllDisposalRecordItems();
    Object.assign(latestMap, fetchedAll);
  }

  const combinedMap = new Map<string, DisposalRecordItem>();

  const orderedRecords = [...records].reverse();
  for (const rec of orderedRecords) {
    const batchItems = deduplicateItemsList(latestMap[rec.id] || []);
    for (const it of batchItems) {
      const key = (it.internal_code || it.barcode || it.product_name).trim().toLowerCase();
      const existing = combinedMap.get(key);
      const qty = Number(it.quantity) || 1;
      if (!existing) {
        combinedMap.set(key, {
          product_name: it.product_name,
          internal_code: it.internal_code || null,
          barcode: it.barcode,
          quantity: qty,
          form_stt: it.form_stt !== undefined ? it.form_stt : null
        });
      } else {
        existing.quantity = (Number(existing.quantity) || 1) + qty;
        if ((existing.form_stt === null || existing.form_stt === undefined) && it.form_stt !== null && it.form_stt !== undefined) {
          existing.form_stt = it.form_stt;
        }
      }
    }
  }

  const mergedItems = Array.from(combinedMap.values());
  if (mergedItems.length === 0) return null;

  const oldIds = records.map(r => r.id);
  await deleteAllDisposalRecordsOnline(oldIds);
  const newRecord = await saveDisposalRecordOnline(mergedItems);

  return {
    record: newRecord,
    items: mergedItems
  };
};

