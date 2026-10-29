import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs, 
  QueryDocumentSnapshot, 
  DocumentData,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product } from '../lib/firestoreService';

export const mapDocToProduct = (docSnap: QueryDocumentSnapshot<DocumentData>): Product => {
  const data = docSnap.data();
  const prod: Product = {
    id: docSnap.id,
    userId: data.userId || '',
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
  };

  if (!prod.expiryRecords || prod.expiryRecords.length === 0) {
    if (prod.destructionDate) {
      prod.expiryRecords = [{
        id: 'rec-' + (prod.id || 'init') + '-1',
        expDate: prod.destructionDate,
        destructionDate: prod.destructionDate,
        createdAt: new Date().toISOString()
      }];
    }
  }
  return prod;
};

export interface UseProductPaginationReturn {
  products: Product[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reset: () => Promise<void>;
  updateProductLocally: (updated: Product) => void;
  removeProductLocally: (id: string | number) => void;
  addProductLocally: (newProd: Product) => void;
  totalLoaded: number;
}

export const useProductPagination = (pageSize: number = 50): UseProductPaginationReturn => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  const fetchInitialPage = useCallback(async () => {
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      let q;
      try {
        q = query(
          collection(db, 'products'),
          orderBy('name', 'asc'),
          limit(pageSize)
        );
      } catch {
        q = query(
          collection(db, 'products'),
          limit(pageSize)
        );
      }

      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(mapDocToProduct);

      setProducts(items);
      if (snapshot.docs.length > 0) {
        lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      } else {
        lastDocRef.current = null;
      }

      setHasMore(snapshot.docs.length >= pageSize);
    } catch (err: any) {
      console.error('Error fetching initial product page:', err);
      setError(err?.message || 'Lỗi khi tải danh sách sản phẩm');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMore || !lastDocRef.current) return;

    isFetchingRef.current = true;
    setLoadingMore(true);

    try {
      let q;
      try {
        q = query(
          collection(db, 'products'),
          orderBy('name', 'asc'),
          startAfter(lastDocRef.current),
          limit(pageSize)
        );
      } catch {
        q = query(
          collection(db, 'products'),
          startAfter(lastDocRef.current),
          limit(pageSize)
        );
      }

      const snapshot = await getDocs(q);
      const newItems = snapshot.docs.map(mapDocToProduct);

      if (newItems.length > 0) {
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const filteredNew = newItems.filter(p => !existingIds.has(p.id));
          return [...prev, ...filteredNew];
        });
        lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      }

      if (snapshot.docs.length < pageSize) {
        setHasMore(false);
      }
    } catch (err: any) {
      console.error('Error loading more products:', err);
      setError(err?.message || 'Lỗi khi tải thêm sản phẩm');
    } finally {
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [hasMore, pageSize]);

  const reset = useCallback(async () => {
    lastDocRef.current = null;
    setHasMore(true);
    await fetchInitialPage();
  }, [fetchInitialPage]);

  // Realtime updates optimization: update product locally without re-fetching all
  const updateProductLocally = useCallback((updated: Product) => {
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, []);

  const removeProductLocally = useCallback((id: string | number) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  const addProductLocally = useCallback((newProd: Product) => {
    setProducts(prev => [newProd, ...prev]);
  }, []);

  useEffect(() => {
    fetchInitialPage();
  }, [fetchInitialPage]);

  return {
    products,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reset,
    updateProductLocally,
    removeProductLocally,
    addProductLocally,
    totalLoaded: products.length
  };
};
