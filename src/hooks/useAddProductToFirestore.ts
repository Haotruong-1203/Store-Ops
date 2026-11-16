import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
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
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('barcode', trimmedBarcode)
        .limit(1)
        .maybeSingle();

      if (existing) {
        setError(`Sản phẩm với mã vạch ${trimmedBarcode} đã tồn tại trong hệ thống.`);
        setLoading(false);
        return String(existing.id);
      }

      const generatedId = trimmedBarcode ? ('bc_' + trimmedBarcode) : ('prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
      const newDocData = {
        id: generatedId,
        name: data.name.trim(),
        barcode: trimmedBarcode,
        price: Number(data.price) || 0,
        destroyDaysBeforeExpiry: Number(data.daysBeforeExpiry) || 0,
        internalCode: data.internalCode ? data.internalCode.trim() : null,
        destructionDate: '',
        expiryRecords: [],
        assignedUser: currentUserId || 'shared',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const { error: insErr } = await supabase.from('products').upsert([newDocData], { onConflict: 'id' });
      if (insErr) throw insErr;

      setDocId(generatedId);
      setLoading(false);
      return generatedId;
    } catch (err: any) {
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
