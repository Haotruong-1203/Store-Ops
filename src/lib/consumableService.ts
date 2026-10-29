import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query,
  getDocs,
  writeBatch,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from './firebase';
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
  id: string; // sku
  name: string;
  quantity: number;
  creatorName?: string; // Tên người tạo record
}

export interface ConsumableOrder {
  id: string;
  userId: string;
  creatorName?: string; // Tên người tạo đợt đặt hàng
  orderType?: 'consumable' | 'general'; // Phân loại: Consumable hoặc Hàng khác (Item bán hàng)
  createdAt: string;
  updatedAt?: string;
  records: ConsumableRecord[];
}

const CONSUMABLES_COLLECTION = 'consumables';
const ORDERS_COLLECTION = 'consumable_orders';

// --- ORDERS ---

export const subscribeConsumableOrders = (
  userId: string = 'all',
  onData: (orders: ConsumableOrder[]) => void
) => {
  let q;
  if (!userId || userId === 'all') {
    q = query(collection(db, ORDERS_COLLECTION));
  } else {
    q = query(collection(db, ORDERS_COLLECTION), where('userId', '==', userId));
  }

  return onSnapshot(q, (snapshot) => {
    const list: ConsumableOrder[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const resolvedCreatorName = data.creatorName || (PRESET_USERS[data.userId]?.name) || data.userId || 'Người dùng';
      
      const records: ConsumableRecord[] = (data.records || []).map((r: any) => ({
        id: r.id || '',
        name: r.name || '',
        quantity: typeof r.quantity === 'number' ? r.quantity : (parseInt(r.quantity) || 0),
        creatorName: r.creatorName || resolvedCreatorName
      }));

      list.push({
        id: docSnap.id,
        userId: data.userId || '',
        creatorName: resolvedCreatorName,
        orderType: data.orderType || 'consumable',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt,
        records
      });
    });

    // Sắp xếp ngày tạo mới nhất lên đầu
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    onData(list);
  });
};

export const saveConsumableOrderOnline = async (order: Omit<ConsumableOrder, 'id'>) => {
  const docId = 'order-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
  const docRef = doc(db, ORDERS_COLLECTION, docId);
  await setDoc(docRef, { 
    ...order, 
    id: docId,
    orderType: order.orderType || 'consumable'
  });
};

export const updateConsumableOrderOnline = async (order: ConsumableOrder) => {
  const docRef = doc(db, ORDERS_COLLECTION, order.id);
  await setDoc(docRef, { ...order, updatedAt: new Date().toISOString() }, { merge: true });
};

export const deleteConsumableOrderOnline = async (orderId: string) => {
  const docRef = doc(db, ORDERS_COLLECTION, orderId);
  await deleteDoc(docRef);
};

// --- CONSUMABLE ITEMS ---

// Lắng nghe dữ liệu realtime
export const subscribeConsumables = (
  onData: (items: ConsumableItem[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(collection(db, CONSUMABLES_COLLECTION));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ConsumableItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          sku: data.sku || docSnap.id,
          barcode: data.barcode || '',
          name: data.name || '',
          supplier: data.supplier || '',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
};

export const addConsumableOnline = async (item: Omit<ConsumableItem, 'id'>) => {
  const docId = 'csm-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
  const docRef = doc(db, CONSUMABLES_COLLECTION, docId);
  
  await setDoc(docRef, {
    ...item,
    id: docId,
    sku: item.sku || docId,
    barcode: item.barcode || item.sku || '',
    createdAt: new Date().toISOString()
  });
  return docId;
};

export const updateConsumableOnline = async (item: ConsumableItem) => {
  const docId = item.id || ('csm-' + item.sku);
  const docRef = doc(db, CONSUMABLES_COLLECTION, docId);
  await setDoc(docRef, {
    sku: item.sku,
    barcode: item.barcode || item.sku || '',
    name: item.name,
    supplier: item.supplier || '',
    updatedAt: new Date().toISOString()
  }, { merge: true });
};

export const deleteConsumableOnline = async (itemId: string) => {
  const docRef = doc(db, CONSUMABLES_COLLECTION, itemId);
  await deleteDoc(docRef);
};

// Hàm tiện ích xóa toàn bộ collection
export const clearConsumablesCollection = async () => {
  const q = query(collection(db, CONSUMABLES_COLLECTION));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });
  await batch.commit();
};
