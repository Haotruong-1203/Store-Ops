import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  collection, 
  query, 
  where, 
  limit, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product } from '../lib/firestoreService';
import { mapDocToProduct } from './useProductPagination';
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
        const productsRef = collection(db, 'products');
        const queries = [];
        const isNumeric = /^\d+$/.test(debouncedTerm);

        if (isNumeric) {
          // Barcode exact or prefix
          queries.push(
            getDocs(query(
              productsRef,
              where('barcode', '>=', debouncedTerm),
              where('barcode', '<=', debouncedTerm + '\uf8ff'),
              limit(50)
            ))
          );

          // Internal code prefix
          queries.push(
            getDocs(query(
              productsRef,
              where('internalCode', '>=', debouncedTerm),
              where('internalCode', '<=', debouncedTerm + '\uf8ff'),
              limit(50)
            ))
          );

          // In case numeric name
          queries.push(
            getDocs(query(
              productsRef,
              where('name', '>=', debouncedTerm),
              where('name', '<=', debouncedTerm + '\uf8ff'),
              limit(50)
            ))
          );
        } else {
          // Name search with original case
          queries.push(
            getDocs(query(
              productsRef,
              where('name', '>=', debouncedTerm),
              where('name', '<=', debouncedTerm + '\uf8ff'),
              limit(60)
            ))
          );

          // Name with capitalized first letter (e.g. "bánh" -> "Bánh")
          const titleCase = debouncedTerm.charAt(0).toUpperCase() + debouncedTerm.slice(1);
          if (titleCase !== debouncedTerm) {
            queries.push(
              getDocs(query(
                productsRef,
                where('name', '>=', titleCase),
                where('name', '<=', titleCase + '\uf8ff'),
                limit(60)
              ))
            );
          }

          // Name with all uppercase (e.g. "sting" -> "STING")
          const upper = debouncedTerm.toUpperCase();
          if (upper !== debouncedTerm && upper !== titleCase) {
            queries.push(
              getDocs(query(
                productsRef,
                where('name', '>=', upper),
                where('name', '<=', upper + '\uf8ff'),
                limit(60)
              ))
            );
          }

          // In case user typed barcode with letters or prefix
          queries.push(
            getDocs(query(
              productsRef,
              where('barcode', '>=', debouncedTerm),
              where('barcode', '<=', debouncedTerm + '\uf8ff'),
              limit(30)
            ))
          );
        }

        const querySnapshots = await Promise.allSettled(queries);
        
        // If a newer search was initiated while this one was running, discard
        if (currentSearchId !== activeSearchIdRef.current) return;

        const resultMap = new Map<string, Product>();

        for (const res of querySnapshots) {
          if (res.status === 'fulfilled') {
            res.value.docs.forEach(docSnap => {
              if (!resultMap.has(docSnap.id)) {
                resultMap.set(docSnap.id, mapDocToProduct(docSnap));
              }
            });
          }
        }

        const combined = Array.from(resultMap.values()).slice(0, 100);
        setResults(combined);
      } catch (err: any) {
        if (currentSearchId === activeSearchIdRef.current) {
          console.error('Error during product search:', err);
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
