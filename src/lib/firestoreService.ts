import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

export interface ExpiryRecord {
  id: string;
  expDate: string; // Hạn sử dụng (YYYY-MM-DD)
  destructionDate: string; // Ngày phải hủy (YYYY-MM-DD)
  quantity?: number; // Số lượng
  note?: string; // Ghi chú lưu ý
  createdAt: string;
}

export interface Product {
  id?: number | string;
  userId?: string; // Tài khoản sở hữu (ví dụ 'conghao', 'thuylinh', 'tramanh')
  barcode: string;
  internalCode?: string; // tối đa 8 số
  name: string;
  mfgDate?: string;
  destructionDate?: string;
  destroyDaysBeforeExpiry?: number; // Số ngày phải hủy trước HSD
  price: number;
  expiryRecords?: ExpiryRecord[];
  createdAt?: string;
  updatedAt?: string;
}

const COLLECTION_NAME = 'products';

// Lắng nghe dữ liệu realtime từ Firestore (Dùng chung cho tất cả user)
export const subscribeProducts = (
  userId: string,
  onData: (products: Product[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const productsRef = collection(db, COLLECTION_NAME);
    const q = query(productsRef); // Mọi người dùng đều thấy chung data

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Product[] = [];
        snapshot.forEach((docSnap) => {
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
            updatedAt: data.updatedAt
          });
        });

        // Chuẩn hóa và sort theo tên / ngày tạo
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
      },
      (error) => {
        console.error('Firestore subscription error:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error('Failed to setup Firestore subscription:', err);
    return () => {};
  }
};

// Thêm sản phẩm lên Firestore
export const addProductOnline = async (product: Omit<Product, 'id'>, userId: string): Promise<string> => {
  const docId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const docRef = doc(db, COLLECTION_NAME, docId);

  // Đảm bảo không truyền undefined lên Firestore
  const payload: Record<string, any> = {
    id: docId,
    userId: userId,
    barcode: product.barcode || '',
    name: product.name || '',
    price: Number(product.price) || 0,
    destroyDaysBeforeExpiry: product.destroyDaysBeforeExpiry ?? 0,
    destructionDate: product.destructionDate || '',
    expiryRecords: product.expiryRecords || (product.destructionDate ? [{
      id: 'rec-' + Date.now(),
      expDate: product.destructionDate,
      destructionDate: product.destructionDate,
      createdAt: new Date().toISOString()
    }] : []),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (product.internalCode) payload.internalCode = product.internalCode;
  if (product.mfgDate) payload.mfgDate = product.mfgDate;

  await setDoc(docRef, payload);
  return docId;
};

// Cập nhật sản phẩm
export const updateProductOnline = async (product: Product): Promise<void> => {
  if (!product.id) return;
  const docRef = doc(db, COLLECTION_NAME, String(product.id));

  const payload: Record<string, any> = {
    barcode: product.barcode || '',
    name: product.name || '',
    price: Number(product.price) || 0,
    destroyDaysBeforeExpiry: product.destroyDaysBeforeExpiry ?? 0,
    destructionDate: product.destructionDate || '',
    expiryRecords: product.expiryRecords || [],
    updatedAt: new Date().toISOString()
  };

  if (product.userId) payload.userId = product.userId;
  if (product.internalCode !== undefined) payload.internalCode = product.internalCode;
  if (product.mfgDate !== undefined) payload.mfgDate = product.mfgDate;

  await setDoc(docRef, payload, { merge: true });
};

// Xóa sản phẩm
export const deleteProductOnline = async (id: string | number): Promise<void> => {
  const docRef = doc(db, COLLECTION_NAME, String(id));
  await deleteDoc(docRef);
};

export const clearProductsCollection = async () => {
  const q = query(collection(db, COLLECTION_NAME));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });
  await batch.commit();
};

// Di chuyển dữ liệu từ local (IndexedDB) sang Online Firestore nếu có
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
