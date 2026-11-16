import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Product, BarcodeSearchState } from '../types/product';
import { calculateDestructionDate } from '../lib/utils';

const barcodeCache = new Map<string, Product>();

export const invalidateBarcodeCache = (barcode?: string) => {
  if (barcode) {
    barcodeCache.delete(barcode.trim());
  } else {
    barcodeCache.clear();
  }
};

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

    setLoading(true);
    setError(null);
    setProduct(null);

    try {
      const { data: primaryData, error: primaryErr } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', trimmedBarcode)
        .limit(1)
        .maybeSingle();

      if (primaryErr) throw primaryErr;

      let found = primaryData;

      if (!found) {
        const { data: internalData, error: internalErr } = await supabase
          .from('products')
          .select('*')
          .eq('internalCode', trimmedBarcode)
          .limit(1)
          .maybeSingle();

        if (internalErr) throw internalErr;
        found = internalData;
      }

      if (found) {
        const realBarcode = String(found.barcode || trimmedBarcode).trim();
        let destroyDays = found.destroyDaysBeforeExpiry ?? 0;
        let destructionDate = found.destructionDate || '';
        let expiryRecords = found.expiryRecords || [];

        try {
          const { data: expData, error: expErr } = await supabase
            .from('product_expiry')
            .select('barcode, exp_date, destroy_days')
            .eq('barcode', realBarcode)
            .maybeSingle();

          if (!expErr && expData && expData.exp_date) {
            destroyDays = Number(expData.destroy_days) || 0;
            destructionDate = calculateDestructionDate(String(expData.exp_date), destroyDays);
            expiryRecords = [
              {
                id: 'rec_' + realBarcode,
                expDate: String(expData.exp_date),
                destructionDate,
                createdAt: new Date().toISOString()
              }
            ];
          }
        } catch {}

        const foundProduct: Product = {
          id: String(found.id),
          name: found.name || '',
          barcode: realBarcode,
          sku: found.sku || found.internalCode || String(found.id),
          internalCode: found.internalCode || undefined,
          price: Number(found.price) || 0,
          expireDate: found.expireDate || null,
          destructionDate,
          destroyDaysBeforeExpiry: destroyDays,
          imageUrl: found.imageUrl || undefined,
          quantity: found.quantity || 0,
          category: found.category || undefined,
          expiryRecords,
          userId: found.userId || '',
          createdAt: found.createdAt || undefined,
          updatedAt: found.updatedAt || undefined
        };

        barcodeCache.set(trimmedBarcode, foundProduct);
        barcodeCache.set(realBarcode, foundProduct);
        setProduct(foundProduct);
        setError(null);
      } else {
        setProduct(null);
        setError(`Không tìm thấy sản phẩm với mã: ${trimmedBarcode}`);
      }
    } catch (err: any) {
      setError('Lỗi kết nối cơ sở dữ liệu. Vui lòng thử lại.');
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    product,
    loading,
    error,
    searchByBarcode
  };
};

