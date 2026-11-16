import { supabase } from './supabase';
import { PRESET_USERS } from './auth';

export interface ConsumableItem {
  id?: string;
  sku: string;
  barcode?: string;
  name: string;
  supplier?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConsumableRecord {
  id: string;
  name: string;
  quantity: number;
  creatorName?: string;
}

export interface ConsumableOrder {
  id: string;
  userId: string;
  creatorName?: string;
  orderType?: 'consumable' | 'general';
  createdAt: string;
  updatedAt?: string;
  records: ConsumableRecord[];
}

const ORDERS_TABLE = 'consumable_orders';
const CONSUMABLES_TABLE = 'consumables';

const orderSubscribers = new Set<(orders: ConsumableOrder[]) => void>();
const consumableSubscribers = new Set<(items: ConsumableItem[]) => void>();

const mapRowToOrder = (row: any): ConsumableOrder => {
  const resolvedCreatorName = row.createdByName || (PRESET_USERS[row.createdBy]?.name) || row.createdBy || 'Người dùng';
  let records: ConsumableRecord[] = [];
  let orderType: 'consumable' | 'general' = 'consumable';

  if (row.unit) {
    try {
      if (typeof row.unit === 'string' && (row.unit.startsWith('{') || row.unit.startsWith('['))) {
        const parsed = JSON.parse(row.unit);
        if (Array.isArray(parsed)) {
          records = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.records)) records = parsed.records;
          if (parsed.orderType) orderType = parsed.orderType;
        }
      }
    } catch {}
  }

  if (records.length === 0 && row.note) {
    const regex = /(.+?)\s*\(x(\d+)\)(?:,\s*|$)/g;
    let match;
    while ((match = regex.exec(row.note)) !== null) {
      records.push({
        id: 'rec-' + row.id + '-' + records.length,
        name: match[1].trim(),
        quantity: parseInt(match[2], 10) || 1,
        creatorName: resolvedCreatorName
      });
    }
  }

  if (records.length === 0 && row.consumableName) {
    records = [{
      id: 'rec-' + row.id,
      name: row.consumableName,
      quantity: Number(row.quantity) || 1,
      creatorName: resolvedCreatorName
    }];
  }

  return {
    id: row.id,
    userId: row.createdBy || '',
    creatorName: resolvedCreatorName,
    orderType,
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: row.updatedAt,
    records
  };
};

export const fetchAllOrders = async (): Promise<ConsumableOrder[]> => {
  try {
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapRowToOrder);
  } catch (err) {
    console.warn('fetchAllOrders error:', err);
    return [];
  }
};

export const notifyOrderSubscribers = async () => {
  if (orderSubscribers.size === 0) return;
  const orders = await fetchAllOrders();
  orderSubscribers.forEach(cb => {
    try { cb(orders); } catch {}
  });
};

export const notifyConsumableSubscribers = async () => {
  if (consumableSubscribers.size === 0) return;
  try {
    const { data, error } = await supabase
      .from(CONSUMABLES_TABLE)
      .select('*')
      .order('name', { ascending: true });

    if (!error && data) {
      const list: ConsumableItem[] = data.map((row: any) => ({
        id: row.id,
        sku: row.sku || row.id,
        barcode: row.barcode || '',
        name: row.name || '',
        supplier: row.supplier || '',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }));
      consumableSubscribers.forEach(cb => {
        try { cb(list); } catch {}
      });
    }
  } catch {}
};

export const subscribeConsumableOrders = (
  userId: string = 'all',
  onData: (orders: ConsumableOrder[]) => void
) => {
  let isCancelled = false;

  const callbackWrapper = (allOrders: ConsumableOrder[]) => {
    if (isCancelled) return;
    if (userId && userId !== 'all') {
      onData(allOrders.filter(o => o.userId === userId));
    } else {
      onData(allOrders);
    }
  };

  orderSubscribers.add(callbackWrapper);

  const loadOrders = async () => {
    const orders = await fetchAllOrders();
    if (!isCancelled) callbackWrapper(orders);
  };

  loadOrders();

  const channel = supabase
    .channel('orders-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: ORDERS_TABLE },
      () => {
        if (!isCancelled) loadOrders();
      }
    )
    .subscribe();

  const pollInterval = setInterval(() => {
    if (!isCancelled) loadOrders();
  }, 3000);

  return () => {
    isCancelled = true;
    orderSubscribers.delete(callbackWrapper);
    clearInterval(pollInterval);
    supabase.removeChannel(channel);
  };
};

export const saveConsumableOrderOnline = async (order: Omit<ConsumableOrder, 'id'>): Promise<ConsumableOrder> => {
  const docId = 'order-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
  const now = order.createdAt || new Date().toISOString();
  const firstRecord = order.records?.[0];
  const meta = {
    records: order.records,
    orderType: order.orderType || 'consumable'
  };

  const payload: Record<string, any> = {
    id: docId,
    createdBy: order.userId || 'shared',
    createdByName: order.creatorName || 'Người đặt',
    createdAt: now,
    status: 'pending',
    unit: JSON.stringify(meta),
    note: order.records?.map(r => `${r.name} (x${r.quantity})`).join(', ') || ''
  };

  if (firstRecord) {
    payload.consumableName = firstRecord.name;
    payload.quantity = firstRecord.quantity;
  }

  const { error } = await supabase.from(ORDERS_TABLE).insert([payload]);
  if (error) throw error;

  const createdOrder: ConsumableOrder = {
    id: docId,
    userId: order.userId || 'shared',
    creatorName: order.creatorName || 'Người đặt',
    orderType: order.orderType || 'consumable',
    createdAt: now,
    records: order.records
  };

  notifyOrderSubscribers();
  return createdOrder;
};

export const updateConsumableOrderOnline = async (order: ConsumableOrder) => {
  const firstRecord = order.records?.[0];
  const payload: Record<string, any> = {
    consumableName: firstRecord ? firstRecord.name : null,
    quantity: firstRecord ? firstRecord.quantity : 1,
    unit: JSON.stringify({ records: order.records, orderType: order.orderType || 'consumable' }),
    note: order.records?.map(r => `${r.name} (x${r.quantity})`).join(', ') || '',
    updatedAt: new Date().toISOString()
  };

  if (order.creatorName) payload.createdByName = order.creatorName;
  if (order.userId) payload.createdBy = order.userId;

  const { error } = await supabase
    .from(ORDERS_TABLE)
    .update(payload)
    .eq('id', order.id);
  if (error) throw error;
  notifyOrderSubscribers();
};

export const deleteConsumableOrderOnline = async (orderId: string) => {
  const { error } = await supabase
    .from(ORDERS_TABLE)
    .delete()
    .eq('id', orderId);
  if (error) throw error;
  notifyOrderSubscribers();
};

export const subscribeConsumables = (
  onData: (items: ConsumableItem[]) => void,
  onError?: (error: Error) => void
) => {
  let isCancelled = false;
  consumableSubscribers.add(onData);

  const loadConsumables = async () => {
    try {
      const { data, error } = await supabase
        .from(CONSUMABLES_TABLE)
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      if (isCancelled) return;

      const list: ConsumableItem[] = (data || []).map((row: any) => ({
        id: row.id,
        sku: row.sku || row.id,
        barcode: row.barcode || '',
        name: row.name || '',
        supplier: row.supplier || '',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }));

      onData(list);
    } catch (err: any) {
      if (isCancelled) return;
      if (onError) onError(err);
    }
  };

  loadConsumables();

  const channel = supabase
    .channel('consumables-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: CONSUMABLES_TABLE },
      () => {
        if (!isCancelled) loadConsumables();
      }
    )
    .subscribe();

  const pollInterval = setInterval(() => {
    if (!isCancelled) loadConsumables();
  }, 4000);

  return () => {
    isCancelled = true;
    consumableSubscribers.delete(onData);
    clearInterval(pollInterval);
    supabase.removeChannel(channel);
  };
};

export const addConsumableOnline = async (item: Omit<ConsumableItem, 'id'>) => {
  const cleanSku = (item.sku || '').trim();
  const docId = cleanSku ? ('csm_' + cleanSku) : ('csm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
  const payload = {
    id: docId,
    sku: cleanSku || docId,
    name: item.name || '',
    supplier: item.supplier || null,
    created_at: new Date().toISOString()
  };
  const { error } = await supabase.from(CONSUMABLES_TABLE).upsert([payload], { onConflict: 'id' });
  if (error) throw error;
  notifyConsumableSubscribers();
  return docId;
};

export const addConsumablesBulk = async (
  items: Omit<ConsumableItem, 'id'>[],
  onProgress?: (done: number, total: number) => void
): Promise<number> => {
  const total = items.length;
  if (total === 0) return 0;

  const BATCH_SIZE = 500;
  let done = 0;
  const stamp = Date.now();

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const payloads = chunk.map((item, index) => {
      const cleanSku = (item.sku || '').trim();
      const docId = cleanSku ? ('csm_' + cleanSku) : ('csm_' + stamp + '_' + (i + index));
      return {
        id: docId,
        sku: cleanSku || docId,
        name: item.name || '',
        supplier: item.supplier || null,
        created_at: new Date().toISOString()
      };
    });

    const { error } = await supabase.from(CONSUMABLES_TABLE).upsert(payloads, { onConflict: 'id' });
    if (error) throw error;

    done += chunk.length;
    onProgress?.(Math.min(done, total), total);
  }

  notifyConsumableSubscribers();
  return total;
};

export const updateConsumableOnline = async (item: ConsumableItem) => {
  const docId = item.id || ('csm_' + (item.sku || '').trim());
  const payload = {
    sku: item.sku,
    name: item.name,
    supplier: item.supplier || null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from(CONSUMABLES_TABLE)
    .update(payload)
    .eq('id', docId);

  if (error) throw error;
  notifyConsumableSubscribers();
};

export const deleteConsumableOnline = async (itemId: string) => {
  const { error } = await supabase
    .from(CONSUMABLES_TABLE)
    .delete()
    .eq('id', itemId);
  if (error) throw error;
  notifyConsumableSubscribers();
};

export const clearConsumablesCollection = async () => {
  const { error } = await supabase
    .from(CONSUMABLES_TABLE)
    .delete()
    .neq('id', '');
  if (error) throw error;
  notifyConsumableSubscribers();
};
