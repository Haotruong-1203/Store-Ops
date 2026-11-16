import { supabase } from './supabase';
import { Product, ExpiryRecord, updateProductOnline } from './firestoreService';
import { calculateDestructionDate, getStatus, isValidRealExpiryDate, getProductRecords } from './utils';

export interface ProductExpiryRow {
  barcode: string;
  exp_date: string;
  destroy_days: number;
}

export interface EnrichedExpiryItem {
  barcode: string;
  exp_date: string;
  destroy_days: number;
  destructionDate: string;
  product: Product;
  status: ReturnType<typeof getStatus>;
}

const EXPIRY_TABLE = 'product_expiry';
const LOCAL_EXPIRY_CACHE_KEY = 'unified_product_expiry_cache_v1';

let expiryTableAvailable: boolean | null = null;
const listeners = new Set<() => void>();

export const notifyExpiryChanged = () => {
  listeners.forEach(fn => {
    try {
      fn();
    } catch {}
  });
};

const getLocalExpiryMap = (): Record<string, ProductExpiryRow> => {
  try {
    const raw = localStorage.getItem(LOCAL_EXPIRY_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveLocalExpiryMap = (map: Record<string, ProductExpiryRow>) => {
  try {
    localStorage.setItem(LOCAL_EXPIRY_CACHE_KEY, JSON.stringify(map));
  } catch {}
};

export const getProductExpiryByBarcode = async (
  barcode: string
): Promise<ProductExpiryRow | null> => {
  const clean = (barcode || '').trim();
  if (!clean) return null;

  if (expiryTableAvailable !== false) {
    try {
      const { data, error } = await supabase
        .from(EXPIRY_TABLE)
        .select('barcode, exp_date, destroy_days')
        .eq('barcode', clean)
        .maybeSingle();

      if (error) {
        if (
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          (error.message && error.message.includes('Could not find the table'))
        ) {
          expiryTableAvailable = false;
        }
      } else if (data && data.exp_date) {
        expiryTableAvailable = true;
        return {
          barcode: String(data.barcode).trim(),
          exp_date: String(data.exp_date).trim(),
          destroy_days: Number(data.destroy_days) || 0
        };
      }
    } catch {}
  }

  const localMap = getLocalExpiryMap();
  if (localMap[clean] && localMap[clean].exp_date) {
    return localMap[clean];
  }

  try {
    const { data: prod } = await supabase
      .from('products')
      .select('barcode, destructionDate, destroyDaysBeforeExpiry, expiryRecords')
      .eq('barcode', clean)
      .limit(1)
      .maybeSingle();

    if (prod) {
      const records = Array.isArray(prod.expiryRecords) ? prod.expiryRecords : [];
      const firstRec = records.find((r: any) => isValidRealExpiryDate(r.expDate || r.destructionDate));
      const expDate = firstRec?.expDate || prod.destructionDate || '';
      if (isValidRealExpiryDate(expDate)) {
        return {
          barcode: clean,
          exp_date: expDate,
          destroy_days: Number(prod.destroyDaysBeforeExpiry) || 0
        };
      }
    }
  } catch {}

  return null;
};

export const fetchEnrichedExpiries = async (
  localProducts: Product[] = []
): Promise<EnrichedExpiryItem[]> => {
  const productByBarcode = new Map<string, Product>();
  localProducts.forEach(p => {
    if (p.barcode) {
      productByBarcode.set(p.barcode.trim(), p);
    }
  });

  const expiryMap = new Map<string, ProductExpiryRow>();
  const localMap = getLocalExpiryMap();
  Object.values(localMap).forEach(r => {
    if (r && r.barcode && r.exp_date) {
      expiryMap.set(r.barcode.trim(), r);
    }
  });

  if (expiryTableAvailable !== false) {
    try {
      const { data, error } = await supabase
        .from(EXPIRY_TABLE)
        .select('barcode, exp_date, destroy_days');

      if (error) {
        if (
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          (error.message && error.message.includes('Could not find the table'))
        ) {
          expiryTableAvailable = false;
        }
      } else if (Array.isArray(data)) {
        expiryTableAvailable = true;
        data.forEach((row: any) => {
          const bc = String(row.barcode || '').trim();
          const exp = String(row.exp_date || '').trim();
          if (bc && exp) {
            expiryMap.set(bc, {
              barcode: bc,
              exp_date: exp,
              destroy_days: Number(row.destroy_days) || 0
            });
          }
        });
      }
    } catch {}
  }

  try {
    const { data: trackedData } = await supabase
      .from('products')
      .select('*')
      .neq('destructionDate', '')
      .not('destructionDate', 'is', null)
      .limit(500);

    if (Array.isArray(trackedData)) {
      trackedData.forEach((row: any) => {
        const bc = String(row.barcode || '').trim();
        if (!bc) return;
        const prod: Product = {
          ...row,
          expiryRecords: row.expiryRecords || []
        };
        productByBarcode.set(bc, prod);

        if (!expiryMap.has(bc)) {
          const recs = getProductRecords(prod);
          const first = recs[0];
          const expDate = first?.expDate || prod.destructionDate || '';
          const destDate = first?.destructionDate || prod.destructionDate || '';
          if (isValidRealExpiryDate(destDate)) {
            expiryMap.set(bc, {
              barcode: bc,
              exp_date: expDate || destDate,
              destroy_days: Number(prod.destroyDaysBeforeExpiry) || 0
            });
          }
        }
      });
    }
  } catch {}

  localProducts.forEach(p => {
    const bc = (p.barcode || '').trim();
    if (!bc || expiryMap.has(bc)) return;
    const recs = getProductRecords(p);
    const first = recs[0];
    const expDate = first?.expDate || p.destructionDate || '';
    const destDate = first?.destructionDate || p.destructionDate || '';
    if (isValidRealExpiryDate(destDate)) {
      expiryMap.set(bc, {
        barcode: bc,
        exp_date: expDate || destDate,
        destroy_days: Number(p.destroyDaysBeforeExpiry) || 0
      });
    }
  });

  const missingBarcodes: string[] = [];
  expiryMap.forEach((_, bc) => {
    if (!productByBarcode.has(bc)) {
      missingBarcodes.push(bc);
    }
  });

  if (missingBarcodes.length > 0) {
    try {
      const { data: fetchedProds } = await supabase
        .from('products')
        .select('*')
        .in('barcode', missingBarcodes);

      if (Array.isArray(fetchedProds)) {
        fetchedProds.forEach((row: any) => {
          const bc = String(row.barcode || '').trim();
          if (bc) {
            productByBarcode.set(bc, {
              ...row,
              expiryRecords: row.expiryRecords || []
            } as Product);
          }
        });
      }
    } catch {}
  }

  const enriched: EnrichedExpiryItem[] = [];

  expiryMap.forEach(row => {
    const destructionDate = calculateDestructionDate(row.exp_date, row.destroy_days);
    if (!isValidRealExpiryDate(destructionDate)) return;

    const prod = productByBarcode.get(row.barcode) || {
      id: `bc_${row.barcode}`,
      barcode: row.barcode,
      name: `Sản phẩm (${row.barcode})`,
      price: 0,
      destroyDaysBeforeExpiry: row.destroy_days,
      destructionDate,
      expiryRecords: []
    };

    const status = getStatus(destructionDate);
    enriched.push({
      barcode: row.barcode,
      exp_date: row.exp_date,
      destroy_days: row.destroy_days,
      destructionDate,
      product: {
        ...prod,
        destroyDaysBeforeExpiry: row.destroy_days,
        destructionDate
      },
      status
    });
  });

  enriched.sort((a, b) => {
    const aUrgent = a.status.isExpired || a.status.isNear ? 0 : 1;
    const bUrgent = b.status.isExpired || b.status.isNear ? 0 : 1;
    if (aUrgent !== bUrgent) {
      return aUrgent - bUrgent;
    }
    const timeA = new Date(a.destructionDate).getTime();
    const timeB = new Date(b.destructionDate).getTime();
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    return a.product.name.localeCompare(b.product.name, 'vi');
  });

  return enriched;
};

export const saveProductExpiry = async (
  row: ProductExpiryRow,
  existingProduct?: Product
): Promise<Product> => {
  const bc = (row.barcode || '').trim();
  const destroyDays = isNaN(Number(row.destroy_days)) || Number(row.destroy_days) < 0 ? 0 : Number(row.destroy_days);
  const destructionDate = calculateDestructionDate(row.exp_date, destroyDays);
  const nowIso = new Date().toISOString();

  const localMap = getLocalExpiryMap();
  localMap[bc] = {
    barcode: bc,
    exp_date: row.exp_date,
    destroy_days: destroyDays
  };
  saveLocalExpiryMap(localMap);

  if (expiryTableAvailable !== false && bc) {
    try {
      const { error } = await supabase
        .from(EXPIRY_TABLE)
        .upsert(
          {
            barcode: bc,
            exp_date: row.exp_date,
            destroy_days: destroyDays
          },
          { onConflict: 'barcode' }
        );

      if (error) {
        if (
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          (error.message && error.message.includes('Could not find the table'))
        ) {
          expiryTableAvailable = false;
        }
      } else {
        expiryTableAvailable = true;
      }
    } catch {}
  }

  let baseProd = existingProduct;
  if (!baseProd || !baseProd.id) {
    try {
      const { data: dbProd } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', bc)
        .limit(1)
        .maybeSingle();

      if (dbProd) {
        baseProd = {
          ...dbProd,
          expiryRecords: dbProd.expiryRecords || []
        } as Product;
      }
    } catch {}
  }

  const newRecord: ExpiryRecord = {
    id: 'rec_' + bc,
    expDate: row.exp_date,
    destructionDate,
    createdAt: nowIso
  };

  const updatedProduct: Product = {
    ...(baseProd || {
      barcode: bc,
      name: `Sản phẩm (${bc})`,
      price: 0
    }),
    id: baseProd?.id || `bc_${bc}`,
    barcode: bc,
    destroyDaysBeforeExpiry: destroyDays,
    destructionDate,
    expiryRecords: [newRecord],
    updatedAt: nowIso
  };

  try {
    await updateProductOnline(updatedProduct);
  } catch {}

  notifyExpiryChanged();
  return updatedProduct;
};

export const deleteProductExpiry = async (
  barcode: string,
  productId?: string | number
): Promise<void> => {
  const bc = (barcode || '').trim();
  if (!bc) return;

  const localMap = getLocalExpiryMap();
  delete localMap[bc];
  saveLocalExpiryMap(localMap);

  if (expiryTableAvailable !== false) {
    try {
      await supabase
        .from(EXPIRY_TABLE)
        .delete()
        .eq('barcode', bc);
    } catch {}
  }

  try {
    const query = supabase
      .from('products')
      .update({
        destructionDate: '',
        expiryRecords: [],
        updatedAt: new Date().toISOString()
      });

    if (productId) {
      await query.eq('id', String(productId));
    } else {
      await query.eq('barcode', bc);
    }
  } catch {}

  notifyExpiryChanged();
};

export const subscribeProductExpiries = (
  localProducts: Product[],
  onData: (items: EnrichedExpiryItem[]) => void
) => {
  let isCancelled = false;

  const load = async () => {
    const items = await fetchEnrichedExpiries(localProducts);
    if (!isCancelled) {
      onData(items);
    }
  };

  load();
  listeners.add(load);

  const channel = supabase
    .channel('product-expiries-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      () => {
        load();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: EXPIRY_TABLE },
      () => {
        load();
      }
    )
    .subscribe();

  return () => {
    isCancelled = true;
    listeners.delete(load);
    supabase.removeChannel(channel);
  };
};
