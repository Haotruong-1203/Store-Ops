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
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 flex flex-col justify-between transition-colors hover:border-zinc-300">
      <div>
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-zinc-900 text-sm sm:text-base leading-snug line-clamp-2">
              {product.name}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md">
                <BarcodeIcon size={12} className="text-zinc-400" />
                {product.barcode}
              </span>
              {product.internalCode && (
                <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-md">
                  <Tag size={11} className="text-zinc-400" />
                  #{product.internalCode}
                </span>
              )}
              {product.destroyDaysBeforeExpiry ? (
                <span className="text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                  Hủy trước: {product.destroyDaysBeforeExpiry} ngày
                </span>
              ) : null}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="font-semibold text-zinc-900 text-sm sm:text-base block">
              {(product.price || 0).toLocaleString('vi-VN')} ₫
            </span>
            {urgentDate && (
              <span className={`inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${urgentStatus.badgeCls}`}>
                {urgentStatus.shortTxt}
              </span>
            )}
          </div>
        </div>

        {records.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-zinc-100 space-y-1.5">
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar size={12} /> Lô hạn sử dụng ({records.length})
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
              {records.map(rec => {
                const recStatus = getStatus(rec.destructionDate);
                return (
                  <div 
                    key={rec.id} 
                    className="flex items-center justify-between text-xs bg-zinc-50 border border-zinc-200/60 px-2.5 py-1.5 rounded-xl"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-zinc-700">HSD: {formatDate(rec.expDate)}</span>
                        <span className="text-zinc-300">•</span>
                        <span className="text-zinc-600">Hủy: {formatDate(rec.destructionDate)}</span>
                        {rec.quantity !== undefined && (
                          <span className="font-semibold text-zinc-800 bg-white border border-zinc-200 px-1.5 rounded text-[11px]">
                            SL: {rec.quantity}
                          </span>
                        )}
                      </div>
                      {rec.note && (
                        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{rec.note}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${recStatus.badgeCls}`}>
                        {recStatus.shortTxt}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteRecord(product, rec.id)}
                        className="p-1 text-zinc-400 hover:text-red-600 rounded transition-colors cursor-pointer"
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
        <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onAddRecord(product)}
            className="text-xs font-medium text-zinc-800 hover:bg-zinc-100 bg-zinc-50 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1 border border-zinc-200/80 cursor-pointer"
          >
            <CalendarPlus size={14} /> Thêm HSD
          </button>

          <div className="flex items-center gap-1.5">
            <button 
              type="button"
              onClick={() => onEdit(product)}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 border border-zinc-200/80 cursor-pointer"
            >
              <Edit2 size={13} /> Sửa
            </button>
            <button 
              type="button"
              onClick={() => onDelete(product)}
              className="text-xs font-medium text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 border border-red-200/60 cursor-pointer"
            >
              <Trash2 size={13} /> Xóa
            </button>
          </div>
        </div>

        {showBarcodeImage && product.barcode && product.barcode.length === 13 && (
          <div className="mt-2.5 pt-2 border-t border-zinc-100 flex justify-center bg-zinc-50/50 rounded-xl overflow-hidden">
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
