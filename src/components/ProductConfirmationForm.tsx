import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Check, 
  AlertTriangle, 
  Barcode, 
  Sparkles, 
  Loader2, 
  RotateCcw,
  Tag,
  DollarSign,
  Clock,
  Hash
} from 'lucide-react';
import { ProductData } from '../types/product';

export interface ProductConfirmationFormProps {
  productData: ProductData;
  confidence: number;
  onSave: (data: ProductData) => Promise<void> | void;
  onCancel: () => void;
  isSaving?: boolean;
}

export const ProductConfirmationForm: React.FC<ProductConfirmationFormProps> = ({
  productData,
  confidence,
  onSave,
  onCancel,
  isSaving = false
}) => {
  const [formData, setFormData] = useState<ProductData>({ ...productData });
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  const validate = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errors.name = 'Vui lòng nhập tên sản phẩm (tối thiểu 2 ký tự).';
    }

    if (formData.price <= 0) {
      errors.price = 'Giá bán phải lớn hơn 0.';
    }

    if (!formData.barcode || formData.barcode.length < 8) {
      errors.barcode = 'Mã vạch barcode không hợp lệ.';
    }

    if (formData.daysBeforeExpiry < 0 || formData.daysBeforeExpiry > 60) {
      errors.daysBeforeExpiry = 'Ngày hủy trước hạn (H-X) nên từ 0-60 ngày.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave(formData);
    }
  };

  const isLowConfidence = confidence < 70;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="w-full flex flex-col gap-3.5"
    >
      {/* OCR Accuracy Badge & Notice */}
      <div className={`p-3.5 rounded-2xl flex items-center justify-between shadow-apple-soft border-0 ${
        isLowConfidence ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'
      }`}>
        <div className="flex items-center gap-2">
          {isLowConfidence ? (
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          ) : (
            <Sparkles size={18} className="text-emerald-600 shrink-0" />
          )}
          <span className="text-xs font-bold">
            {isLowConfidence
              ? 'Độ chính xác OCR: ' + confidence + '% (Hãy kiểm tra lại)'
              : 'Độ chính xác OCR: ' + confidence + '%'}
          </span>
        </div>
        <span className="text-[0.68rem] font-semibold uppercase px-2.5 py-1 rounded-full bg-white/90 shadow-apple-soft border-0">
          Bảng giá
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Product Name (Editable) */}
        <div className="space-y-1">
          <label className="text-[0.75rem] font-bold text-slate-700 uppercase flex items-center gap-1">
            <Tag size={13} className="text-blue-600" /> Tên sản phẩm *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="VD: Thanh Surimi càng cua hoàng đế"
            className="w-full p-3.5 bg-slate-100/80 border-0 rounded-2xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {validationErrors.name && (
            <p className="text-[0.7rem] text-rose-600 font-medium">{validationErrors.name}</p>
          )}
        </div>

        {/* Price & H-number (Days before expiry) */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[0.75rem] font-bold text-slate-700 uppercase flex items-center gap-1">
              <DollarSign size={13} className="text-emerald-600" /> Giá bán (VNĐ) *
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={formData.price || ''}
              onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
              placeholder="VD: 19000"
              className="w-full p-3.5 bg-slate-100/80 border-0 rounded-2xl text-sm font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {validationErrors.price && (
              <p className="text-[0.7rem] text-rose-600 font-medium">{validationErrors.price}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[0.75rem] font-bold text-slate-700 uppercase flex items-center gap-1">
              <Clock size={13} className="text-amber-600" /> Hủy trước (H-X)
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                value={formData.daysBeforeExpiry}
                onChange={(e) => setFormData({ ...formData, daysBeforeExpiry: parseInt(e.target.value) || 0 })}
                placeholder="2"
                className="w-full p-3.5 bg-slate-100/80 border-0 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <span className="absolute right-3 top-3.5 text-xs font-semibold text-slate-400">
                ngày
              </span>
            </div>
            {validationErrors.daysBeforeExpiry && (
              <p className="text-[0.7rem] text-rose-600 font-medium">{validationErrors.daysBeforeExpiry}</p>
            )}
          </div>
        </div>

        {/* Barcode (Readonly highlight) & Internal Code (6-digit) */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[0.75rem] font-bold text-slate-700 uppercase flex items-center gap-1">
              <Barcode size={13} className="text-slate-600" /> Mã Barcode
            </label>
            <input
              type="text"
              value={formData.barcode}
              readOnly
              className="w-full p-3.5 bg-emerald-50/90 border-0 rounded-2xl text-xs font-mono font-bold text-emerald-800 cursor-not-allowed shadow-apple-soft"
            />
            {validationErrors.barcode && (
              <p className="text-[0.7rem] text-rose-600 font-medium">{validationErrors.barcode}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[0.75rem] font-bold text-slate-700 uppercase flex items-center gap-1">
              <Hash size={13} className="text-indigo-600" /> Mã nội bộ (SKU)
            </label>
            <input
              type="text"
              value={formData.internalCode}
              onChange={(e) => setFormData({ ...formData, internalCode: e.target.value })}
              placeholder="VD: 240810"
              className="w-full p-3.5 bg-slate-100/80 border-0 rounded-2xl text-xs font-mono font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Action Buttons (min 48px touch friendly) */}
        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 font-bold rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs border-0"
          >
            <RotateCcw size={16} />
            Quét lại
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white font-bold rounded-full flex items-center justify-center gap-2 shadow-apple transition-all cursor-pointer text-sm border-0"
          >
            {isSaving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Đang lưu...
              </>
            ) : (
              <>
                <Check size={18} />
                Lưu sản phẩm
              </>
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
};
