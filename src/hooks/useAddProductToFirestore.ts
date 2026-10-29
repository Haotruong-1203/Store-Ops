import { useState, useCallback } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ProductData } from '../types/product';

export interface AddProductResult {
  loading: boolean;
  error: string | null;
  docId: string | null;
  addProduct: (data: ProductData, currentUserId?: string) => Promise<string | null>;
}

export const useAddProductToFirestore = (): AddProductResult => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);

  const addProduct = useCallback(async (data: ProductData, currentUserId?: string): Promise<string | null> => {
    setLoading(true);
    setError(null);
    setDocId(null);

    // 1. Validation
    if (!data.name || data.name.trim().length < 2) {
      setError('Vui lòng nhập tên sản phẩm.');
      setLoading(false);
      return null;
    }

    if (!data.barcode || !data.barcode.trim()) {
      setError('Vui lòng cung cấp mã vạch barcode.');
      setLoading(false);
      return null;
    }

    if (data.price < 0) {
      setError('Giá phải lớn hơn hoặc bằng 0.');
      setLoading(false);
      return null;
    }

    if (data.daysBeforeExpiry < 0 || data.daysBeforeExpiry > 60) {
      setError('Ngày hủy (H-X) phải từ 0-60 ngày.');
      setLoading(false);
      return null;
    }

    const trimmedBarcode = data.barcode.trim();

    try {
      const productsRef = collection(db, 'products');

      // 2. Check if product already exists to prevent duplicates
      const dupQuery = query(productsRef, where('barcode', '==', trimmedBarcode));
      const dupSnapshot = await getDocs(dupQuery);

      if (!dupSnapshot.empty) {
        const existingDoc = dupSnapshot.docs[0];
        setError(`Sản phẩm với mã vạch ${trimmedBarcode} đã tồn tại trong hệ thống.`);
        setLoading(false);
        return existingDoc.id;
      }

      // 3. Create document in Firestore
      const newDocData = {
        name: data.name.trim(),
        barcode: trimmedBarcode,
        price: Number(data.price) || 0,
        destroyDaysBeforeExpiry: Number(data.daysBeforeExpiry) || 0,
        internalCode: data.internalCode ? data.internalCode.trim() : '',
        sku: data.internalCode ? data.internalCode.trim() : trimmedBarcode,
        priceTagImageUrl: data.imageUrl || null,
        destructionDate: '',
        expiryRecords: [],
        status: 'active',
        userId: currentUserId || 'all',
        createdBy: currentUserId || 'all',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      };

      const docRef = await addDoc(productsRef, newDocData);
      setDocId(docRef.id);
      setLoading(false);
      return docRef.id;
    } catch (err: any) {
      console.error('Add product to Firestore error:', err);
      const msg = err.message || 'Lỗi kết nối cơ sở dữ liệu. Vui lòng thử lại.';
      setError(msg);
      setLoading(false);
      return null;
    }
  }, []);

  return {
    loading,
    error,
    docId,
    addProduct
  };
};
