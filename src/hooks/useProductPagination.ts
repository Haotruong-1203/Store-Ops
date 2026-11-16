import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Product } from '../lib/firestoreService';

export const mapDocToProduct = (row: any): Product => ({
  id: row.id,
  userId: row.userId || '',
  barcode: row.barcode || '',
  internalCode: row.internalCode || undefined,
  name: row.name || '',
  mfgDate: row.mfgDate || '',
  destructionDate: row.destructionDate || '',
  destroyDaysBeforeExpiry: row.destroyDaysBeforeExpiry ?? 0,
  price: Number(row.price) || 0,
  expiryRecords: row.expiryRecords || [],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

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

  const isFetchingRef = useRef<boolean>(false);

  const fetchInitialPage = useCallback(async () => {
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { data, error: qErr } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true })
        .range(0, pageSize - 1);

      if (qErr) throw qErr;

      const items = (data || []).map(mapDocToProduct);
      setProducts(items);
      setHasMore(items.length >= pageSize);
      try {
        sessionStorage.setItem('cached_pagination_products', JSON.stringify(items.slice(0, 50)));
      } catch {}
    } catch (err: any) {
      const cachedStr = sessionStorage.getItem('cached_pagination_products');
      if (cachedStr) {
        try {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProducts(parsed);
          }
        } catch {}
      }
      setError(err?.message || 'Lỗi khi tải danh sách sản phẩm');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMore) return;

    isFetchingRef.current = true;
    setLoadingMore(true);

    try {
      const offset = products.length;
      const { data, error: qErr } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (qErr) throw qErr;

      const nextItems = (data || []).map(mapDocToProduct);
      if (nextItems.length > 0) {
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const filtered = nextItems.filter(p => !existingIds.has(p.id));
          return [...prev, ...filtered];
        });
        setHasMore(nextItems.length >= pageSize);
      } else {
        setHasMore(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi khi tải thêm');
    } finally {
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [hasMore, pageSize, products.length]);

  const reset = useCallback(async () => {
    setProducts([]);
    setHasMore(true);
    await fetchInitialPage();
  }, [fetchInitialPage]);

  const updateProductLocally = useCallback((updated: Product) => {
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, []);

  const removeProductLocally = useCallback((id: string | number) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  const addProductLocally = useCallback((newProd: Product) => {
    setProducts(prev => [newProd, ...prev]);
  }, []);

  useState(() => {
    fetchInitialPage();
  });

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
