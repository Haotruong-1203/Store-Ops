import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  getDocs
} from 'firebase/firestore';
import { db } from './firebase';
import { runBulk, coalesce, BulkOp } from './bulkWrite';

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

const COLLECTION_NAME = 'products';

export const subscribeProducts = (
  userId: string,
  onData: (products: Product[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const productsRef = collection(db, COLLECTION_NAME);
    const q = query(productsRef, where('destructionDate', '>', ''));

    const throttled = coalesce((snapshot: any) => {
      const list: Product[] = [];
      snapshot.forEach((docSnap: any) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          userId: data.userId || userId,
          barcode: data.barcode || '',
          internalCode: data.internalCode || undefined,
          name: data.name || '',
          mfgDate: data.mfgDate || '',
          destructionDate: data.destructionDate || '',
          destroyDaysBeforeExpiry: data.destroyDaysBeforeExpiry ?? 0,
          price: Number(data.price) || 0,
          expiryRecords: data.expiryRecords || [],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          tracked: data.tracked ?? Boolean(data.destructionDate)
        });
      });

      const normalized = list.map((p) => {
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

      onData(normalized);
    });

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => throttled.push(snapshot),
      (error) => {
        console.error('Firestore subscription error:', error);
        if (onError) onError(error);
      }
    );

    return () => {
      throttled.cancel();
      unsubscribe();
    };
  } catch (err) {
    console.error('Failed to setup Firestore subscription:', err);
    return () => {};
  }
};

export const buildProductPayload = (product: Omit<Product, 'id'>, userId: string, docId: string): Record<string, any> => {
  const destructionDate = product.destructionDate || (product.expiryRecords && product.expiryRecords.length > 0 ? product.expiryRecords[0].destructionDate : '');
  const isTracked = Boolean(destructionDate);

  const payload: Record<string, any> = {
    id: docId,
    userId: userId,
    barcode: product.barcode || '',
    name: product.name || '',
    price: Number(product.price) || 0,
    destroyDaysBeforeExpiry: product.destroyDaysBeforeExpiry ?? 0,
    destructionDate: destructionDate,
    tracked: isTracked,
    expiryRecords: product.expiryRecords || (destructionDate ? [{
      id: 'rec-' + Date.now(),
      expDate: destructionDate,
      destructionDate: destructionDate,
      createdAt: new Date().toISOString()
    }] : []),
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (product.internalCode) payload.internalCode = product.internalCode;
  if (product.mfgDate) payload.mfgDate = product.mfgDate;

  return payload;
};

export const addProductOnline = async (product: Omit<Product, 'id'>, userId: string): Promise<string> => {
  const docId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const docRef = doc(db, COLLECTION_NAME, docId);
  const payload = buildProductPayload(product, userId, docId);
  await setDoc(docRef, payload);
  return docId;
};

export const addProductsBulk = async (
  products: Omit<Product, 'id'>[],
  userId: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> => {
  const now = Date.now();
  const ops: BulkOp[] = products.map((product, index) => {
    const docId = 'prod_' + now + '_' + index + '_' + Math.random().toString(36).substring(2, 7);
    const docRef = doc(db, COLLECTION_NAME, docId);
    const payload = buildProductPayload(product, userId, docId);
    return { type: 'set', ref: docRef, data: payload };
  });
  await runBulk(ops, onProgress);
  return products.length;
};

export const updateProductOnline = async (product: Product): Promise<void> => {
  if (!product.id) return;
  const docRef = doc(db, COLLECTION_NAME, String(product.id));
  const destructionDate = product.destructionDate || (product.expiryRecords && product.expiryRecords.length > 0 ? product.expiryRecords[0].destructionDate : '');
  const isTracked = Boolean(destructionDate);

  const payload: Record<string, any> = {
    barcode: product.barcode || '',
    name: product.name || '',
    price: Number(product.price) || 0,
    destroyDaysBeforeExpiry: product.destroyDaysBeforeExpiry ?? 0,
    destructionDate: destructionDate,
    tracked: isTracked,
    expiryRecords: product.expiryRecords || [],
    updatedAt: new Date().toISOString()
  };

  if (product.userId) payload.userId = product.userId;
  if (product.internalCode !== undefined) payload.internalCode = product.internalCode;
  if (product.mfgDate !== undefined) payload.mfgDate = product.mfgDate;

  await setDoc(docRef, payload, { merge: true });
};

export const deleteProductOnline = async (id: string | number): Promise<void> => {
  const docRef = doc(db, COLLECTION_NAME, String(id));
  await deleteDoc(docRef);
};

export const clearProductsCollection = async () => {
  const q = query(collection(db, COLLECTION_NAME));
  const snapshot = await getDocs(q);
  const ops: BulkOp[] = snapshot.docs.map(docSnap => ({
    type: 'delete',
    ref: docSnap.ref
  }));
  await runBulk(ops);
};

export const syncFromLocalToOnline = async (localProducts: Product[], targetUserId: string) => {
  if (!localProducts || localProducts.length === 0) return 0;
  let count = 0;
  for (const p of localProducts) {
    try {
      await addProductOnline({
        barcode: p.barcode,
        internalCode: p.internalCode,
        name: p.name,
        mfgDate: p.mfgDate,
        destructionDate: p.destructionDate,
        destroyDaysBeforeExpiry: p.destroyDaysBeforeExpiry,
        price: p.price,
        expiryRecords: p.expiryRecords
      }, targetUserId);
      count++;
    } catch (e) {
      console.error('Error syncing item:', p.name, e);
    }
  }
  return count;
};
