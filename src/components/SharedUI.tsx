import React from 'react';
import { Product } from '../lib/firestoreService';
import { formatDate } from '../lib/utils';
import { Trash2, ChevronLeft } from 'lucide-react';

export function Header({ 
  title, 
  onBack, 
  rightElement,
  className = ''
}: { 
  title: string; 
  onBack?: () => void; 
  rightElement?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`w-full flex items-center justify-between px-4 sm:px-6 py-3 bg-white/95 backdrop-blur-md rounded-2xl shadow-apple border-0 transition-all ${className || 'mb-5'}`}>
      <div className="flex items-center justify-start shrink-0">
        {onBack && (
          <button 
            onClick={onBack} 
            className="w-9 h-9 flex items-center justify-center bg-slate-100/90 hover:bg-slate-200/90 rounded-full active:scale-95 transition-all text-slate-700 cursor-pointer border-0"
            title="Quay lại"
          >
            <ChevronLeft size={20} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate px-3">{title}</h1>
      <div className="flex items-center justify-end shrink-0">
        {rightElement}
      </div>
    </header>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-white/90 backdrop-blur-md shadow-apple rounded-3xl p-6 sm:p-8 border-0 overflow-hidden transition-all ${className}`}>
      {children}
    </div>
  );
}

export function InputGroup({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="mb-4 w-full min-w-0">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{label}</label>
      {children}
    </div>
  );
}

export const ProductItem: React.FC<{ 
  product: Product, 
  onDelete?: (id: string | number) => void, 
  showDestructionDate?: boolean 
}> = ({ product, onDelete, showDestructionDate }) => {
  const recordsCount = product.expiryRecords?.length || 0;
  const effectiveDestDate = product.destructionDate;

  return (
    <div className="bg-white/95 rounded-2xl p-4 sm:p-5 mb-3 flex justify-between items-center shadow-apple-soft hover:shadow-apple transition-all border-0">
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">{product.name}</h3>
        <div className="text-xs text-slate-500 mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg text-xs font-medium">{product.barcode}</span>
          {product.internalCode && (
            <span className="text-indigo-700 bg-indigo-50 font-mono px-2 py-0.5 rounded-lg text-[11px] font-bold">
              #{product.internalCode}
            </span>
          )}
          {recordsCount > 1 && (
            <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg text-[11px] font-bold">
              {recordsCount} lô
            </span>
          )}
        </div>
        
        {showDestructionDate || effectiveDestDate ? (
          <p className="text-xs font-semibold text-rose-600 mt-2">
            Hủy: {formatDate(effectiveDestDate)}
          </p>
        ) : product.mfgDate ? (
          <p className="text-xs text-slate-500 mt-1.5">NSX: {formatDate(product.mfgDate)}</p>
        ) : null}
        
        {!showDestructionDate && (
          <p className="font-bold text-slate-900 mt-2 text-sm sm:text-base">
            {(product.price || 0).toLocaleString('vi-VN')} ₫
          </p>
        )}
      </div>

      {onDelete && product.id && (
        <button 
          onClick={() => onDelete(product.id!)}
          className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all ml-3 cursor-pointer border-0"
          title="Xóa sản phẩm"
        >
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
};

export function EmptyState({ icon, message }: { icon: React.ReactNode, message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
      <div className="mb-3 opacity-40">{icon}</div>
      <p className="text-sm font-medium text-zinc-500">{message}</p>
    </div>
  );
}
