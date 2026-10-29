import { useState, useCallback } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, BarcodeSearchState } from '../types/product';

// In-memory cache for fast repeated lookups
const barcodeCache = new Map<string, Product>();

export const useBarcodeSearch = (): BarcodeSearchState => {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const searchByBarcode = useCallback(async (barcodeValue: string) => {
    const trimmedBarcode = barcodeValue ? barcodeValue.trim() : '';
    if (!trimmedBarcode) {
      setError('Mã vạch không hợp lệ');
      setProduct(null);
      return;
    }

    // Check cache first
    if (barcodeCache.has(trimmedBarcode)) {
      setProduct(barcodeCache.get(trimmedBarcode)!);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setProduct(null);

    // Set 5-second timeout for query
    let isTimedOut = false;
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      setLoading(false);
      setError('Quá thời gian tìm kiếm (5s). Vui lòng thử lại.');
    }, 5000);

    try {
      const productsRef = collection(db, 'products');

      // 1. Primary query: match exact barcode
      const barcodeQuery = query(
        productsRef,
        where('barcode', '==', trimmedBarcode),
        limit(1)
      );

      const snapshot = await getDocs(barcodeQuery);

      if (isTimedOut) return;

      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        const foundProduct: Product = {
          id: docSnap.id,
          name: data.name || '',
          barcode: data.barcode || trimmedBarcode,
          sku: data.sku || data.internalCode || docSnap.id,
          internalCode: data.internalCode || undefined,
          price: data.price || 0,
          expireDate: data.expireDate || null,
          destructionDate: data.destructionDate || '',
          destroyDaysBeforeExpiry: data.destroyDaysBeforeExpiry ?? 0,
          imageUrl: data.imageUrl || undefined,
          quantity: data.quantity || 0,
          category: data.category || undefined,
          expiryRecords: data.expiryRecords || [],
          userId: data.userId || '',
          createdAt: data.createdAt || undefined,
          updatedAt: data.updatedAt || undefined
        };

        barcodeCache.set(trimmedBarcode, foundProduct);
        setProduct(foundProduct);
        setError(null);
      } else {
        // Fallback: If barcode is not found, check if it matches internalCode / SKU
        const internalCodeQuery = query(
          productsRef,
          where('internalCode', '==', trimmedBarcode),
          limit(1)
        );
        const internalSnap = await getDocs(internalCodeQuery);

        if (isTimedOut) return;

        if (!internalSnap.empty) {
          const docSnap = internalSnap.docs[0];
          const data = docSnap.data();
          const foundProduct: Product = {
            id: docSnap.id,
            name: data.name || '',
            barcode: data.barcode || '',
            sku: data.sku || data.internalCode || docSnap.id,
            internalCode: data.internalCode || undefined,
            price: data.price || 0,
            expireDate: data.expireDate || null,
            destructionDate: data.destructionDate || '',
            destroyDaysBeforeExpiry: data.destroyDaysBeforeExpiry ?? 0,
            imageUrl: data.imageUrl || undefined,
            quantity: data.quantity || 0,
            category: data.category || undefined,
            expiryRecords: data.expiryRecords || [],
            userId: data.userId || '',
            createdAt: data.createdAt || undefined,
            updatedAt: data.updatedAt || undefined
          };

          barcodeCache.set(trimmedBarcode, foundProduct);
          setProduct(foundProduct);
          setError(null);
        } else {
          setProduct(null);
          setError(`Không tìm thấy sản phẩm với mã: ${trimmedBarcode}`);
        }
      }
    } catch (err: any) {
      if (isTimedOut) return;
      console.error('Firestore barcode lookup error:', err);
      setError('Lỗi kết nối cơ sở dữ liệu. Vui lòng thử lại.');
      setProduct(null);
    } finally {
      clearTimeout(timeoutId);
      if (!isTimedOut) {
        setLoading(false);
      }
    }
  }, []);

  return {
    product,
    loading,
    error,
    searchByBarcode
  };
};
