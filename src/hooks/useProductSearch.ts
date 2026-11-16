import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Product } from '../lib/firestoreService';
import { useDebounce } from './useDebounce';

export interface UseProductSearchReturn {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  debouncedTerm: string;
  results: Product[];
  loading: boolean;
  error: string | null;
  isSearching: boolean;
  clearSearch: () => void;
  updateResultLocally: (updated: Product) => void;
  removeResultLocally: (id: string | number) => void;
}

export const useProductSearch = (delay: number = 300): UseProductSearchReturn => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedTerm = useDebounce<string>(searchTerm.trim(), delay);
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeSearchIdRef = useRef<number>(0);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setResults([]);
    setLoading(false);
    setError(null);
  }, []);

  const updateResultLocally = useCallback((updated: Product) => {
    setResults(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, []);

  const removeResultLocally = useCallback((id: string | number) => {
    setResults(prev => prev.filter(p => p.id !== id));
  }, []);

  useEffect(() => {
    if (!debouncedTerm) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const currentSearchId = ++activeSearchIdRef.current;
    setLoading(true);
    setError(null);

    const executeSearch = async () => {
      try {
        const { data, error: qErr } = await supabase
          .from('products')
          .select('*')
          .or(`name.ilike.%${debouncedTerm}%,barcode.ilike.%${debouncedTerm}%,internalCode.ilike.%${debouncedTerm}%`)
          .order('name', { ascending: true })
          .limit(100);

        if (currentSearchId !== activeSearchIdRef.current) return;

        if (qErr) throw qErr;

        const list: Product[] = (data || []).map((row: any) => ({
          ...row,
          expiryRecords: row.expiryRecords || []
        }));

        setResults(list);
      } catch (err: any) {
        if (currentSearchId === activeSearchIdRef.current) {
          setError(err?.message || 'Lỗi khi tìm kiếm sản phẩm');
        }
      } finally {
        if (currentSearchId === activeSearchIdRef.current) {
          setLoading(false);
        }
      }
    };

    executeSearch();
  }, [debouncedTerm]);

  return {
    searchTerm,
    setSearchTerm,
    debouncedTerm,
    results,
    loading,
    error,
    isSearching: debouncedTerm.length > 0,
    clearSearch,
    updateResultLocally,
    removeResultLocally
  };
};
