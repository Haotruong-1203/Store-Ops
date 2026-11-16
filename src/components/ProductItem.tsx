import React from 'react';
import Barcode from 'react-barcode';
import { 
  Barcode as BarcodeIcon, 
  Tag, 
  Trash2, 
  Edit2, 
  CalendarPlus, 
  Calendar
} from 'lucide-react';
import { Product } from '../lib/firestoreService';
import { 
  formatDate, 
  getStatus, 
  getProductRecords, 
  getEarliestDestructionDate 
} from '../lib/utils';

interface ProductItemProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onAddRecord: (product: Product) => void;
  onDeleteRecord: (product: Product, recordId: string) => void;
  showBarcodeImage?: boolean;
}

export const ProductItem: React.FC<ProductItemProps> = React.memo(({
  product,
  onEdit,
  onDelete,
  onAddRecord,
  onDeleteRecord,
  showBarcodeImage = true
}) => {
  const records = getProductRecords(product);
  const urgentDate = getEarliestDestructionDate(product);
  const urgentStatus = getStatus(urgentDate);

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 flex flex-col justify-between shadow-apple-soft hover:shadow-apple transition-all border-0">
      <div>
        <div className="flex justify-between items-start gap-3 mb-2.5">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug line-clamp-2">
              {product.name}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-lg border-0">
                <BarcodeIcon size={12} className="text-slate-400" />
                {product.barcode}
              </span>
              {product.internalCode && (
                <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border-0">
                  <Tag size={11} className="text-indigo-400" />
                  #{product.internalCode}
                </span>
              )}
              {product.destroyDaysBeforeExpiry ? (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-lg border-0">
                  Hủy trước: {product.destroyDaysBeforeExpiry} ngày
                </span>
              ) : null}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="font-bold text-slate-900 text-sm sm:text-base block">
              {(product.price || 0).toLocaleString('vi-VN')} ₫
            </span>
            {urgentDate && (
              <span className={`inline-block mt-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border-0 ${urgentStatus.badgeCls}`}>
                {urgentStatus.shortTxt}
              </span>
            )}
          </div>
        </div>

        {records.length > 0 && (
          <div className="mt-3.5 pt-3 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar size={12} /> Lô hạn sử dụng ({records.length})
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
              {records.map(rec => {
                const recStatus = getStatus(rec.destructionDate);
                return (
                  <div 
                    key={rec.id} 
                    className="flex items-center justify-between text-xs bg-slate-100/70 px-3 py-2 rounded-xl border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-700">HSD: {formatDate(rec.expDate)}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600">Hủy: {formatDate(rec.destructionDate)}</span>
                        {rec.quantity !== undefined && (
                          <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded-md text-[11px] shadow-2xs border-0">
                            SL: {rec.quantity}
                          </span>
                        )}
                      </div>
                      {rec.note && (
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">{rec.note}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 ${recStatus.badgeCls}`}>
                        {recStatus.shortTxt}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteRecord(product, rec.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-full hover:bg-rose-50 transition-colors cursor-pointer border-0"
                        title="Xóa đợt HSD này"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mt-4 pt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onAddRecord(product)}
            className="text-xs font-semibold text-blue-700 hover:bg-blue-100/80 bg-blue-50 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1 border-0 cursor-pointer shadow-apple-soft"
          >
            <CalendarPlus size={14} /> Thêm HSD
          </button>

          <div className="flex items-center gap-1.5">
            <button 
              type="button"
              onClick={() => onEdit(product)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-all flex items-center gap-1 border-0 cursor-pointer"
            >
              <Edit2 size={13} /> Sửa
            </button>
            <button 
              type="button"
              onClick={() => onDelete(product)}
              className="text-xs font-semibold text-rose-600 hover:bg-rose-50 bg-rose-50/50 px-3 py-1.5 rounded-full transition-all flex items-center gap-1 border-0 cursor-pointer"
            >
              <Trash2 size={13} /> Xóa
            </button>
          </div>
        </div>

        {showBarcodeImage && product.barcode && product.barcode.length === 13 && (
          <div className="mt-3 pt-2.5 flex justify-center bg-slate-50/70 rounded-2xl overflow-hidden p-2">
            <Barcode 
              value={product.barcode} 
              format="EAN13" 
              height={28} 
              width={1.3} 
              displayValue={false} 
              margin={2} 
              background="transparent" 
            />
          </div>
        )}
      </div>
    </div>
  );
});

ProductItem.displayName = 'ProductItem';
