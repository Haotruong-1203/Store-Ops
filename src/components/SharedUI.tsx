import React from 'react';
import { Product } from '../lib/firestoreService';
import { formatDate } from '../lib/utils';
import { Trash2, ChevronLeft } from 'lucide-react';

export function Header({ title, onBack, rightElement }: { title: string; onBack?: () => void; rightElement?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between py-3 mb-4 border-b border-zinc-200/80">
      <div className="w-10 flex items-center justify-start">
        {onBack && (
          <button 
            onClick={onBack} 
            className="w-9 h-9 flex items-center justify-center bg-white border border-zinc-200/90 rounded-xl hover:bg-zinc-50 active:scale-95 transition-all text-zinc-700 cursor-pointer"
          >
            <ChevronLeft size={20} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <h1 className="text-base sm:text-lg font-semibold text-zinc-900 tracking-tight truncate px-2">{title}</h1>
      <div className="w-10 flex items-center justify-end">
        {rightElement}
      </div>
    </header>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-white border border-zinc-200/80 shadow-2xs rounded-2xl p-4 sm:p-6 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export function InputGroup({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="mb-3.5 w-full min-w-0">
      <label className="block text-xs font-medium text-zinc-500 mb-1.5">{label}</label>
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
    <div className="bg-white border border-zinc-200/80 rounded-xl p-4 mb-2.5 flex justify-between items-center transition-colors hover:border-zinc-300">
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-zinc-900 text-sm truncate">{product.name}</h3>
        <div className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="font-mono">{product.barcode}</span>
          {product.internalCode && (
            <span className="text-zinc-700 bg-zinc-100 font-mono px-1.5 py-0.5 rounded text-[11px] font-medium">
              #{product.internalCode}
            </span>
          )}
          {recordsCount > 1 && (
            <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[11px] font-medium">
              {recordsCount} lô
            </span>
          )}
        </div>
        
        {showDestructionDate || effectiveDestDate ? (
          <p className="text-xs font-medium text-red-600 mt-1.5">
            Hủy: {formatDate(effectiveDestDate)}
          </p>
        ) : product.mfgDate ? (
          <p className="text-xs text-zinc-500 mt-1">NSX: {formatDate(product.mfgDate)}</p>
        ) : null}
        
        {!showDestructionDate && (
          <p className="font-semibold text-zinc-900 mt-1.5 text-sm">
            {(product.price || 0).toLocaleString('vi-VN')} ₫
          </p>
        )}
      </div>

      {onDelete && product.id && (
        <button 
          onClick={() => onDelete(product.id!)}
          className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-3 cursor-pointer"
          title="Xóa sản phẩm"
        >
          <Trash2 size={17} />
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
