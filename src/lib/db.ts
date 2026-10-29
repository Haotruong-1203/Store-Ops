export interface ExpiryRecord {
  id: string;
  expDate: string; // Hạn sử dụng (YYYY-MM-DD)
  destructionDate: string; // Ngày phải hủy (YYYY-MM-DD)
  quantity?: number; // Số lượng
  note?: string; // Ghi chú lưu ý
  createdAt: string;
}

export interface Product {
  id?: number;
  barcode: string;
  internalCode?: string; // tối đa 8 số
  name: string;
  mfgDate?: string;
  destructionDate?: string;
  destroyDaysBeforeExpiry?: number; // Số ngày phải hủy trước HSD
  price: number;
  expiryRecords?: ExpiryRecord[];
}

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ProductDB_React', 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('products')) {
        const store = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        store.createIndex('barcode', 'barcode');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const getAllProducts = async (): Promise<Product[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products'], 'readonly');
    const req = tx.objectStore('products').getAll();
    req.onsuccess = () => {
      // Normalize products to have expiryRecords if only destructionDate exists
      const products: Product[] = req.result.map((p: Product) => {
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
      resolve(products);
    };
    req.onerror = () => reject(req.error);
  });
};

export const addProduct = async (product: Omit<Product, 'id'>): Promise<number> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products'], 'readwrite');
    const req = tx.objectStore('products').add(product);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
};

export const updateProduct = async (product: Product): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products'], 'readwrite');
    const req = tx.objectStore('products').put(product);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const deleteProduct = async (id: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products'], 'readwrite');
    const req = tx.objectStore('products').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};
