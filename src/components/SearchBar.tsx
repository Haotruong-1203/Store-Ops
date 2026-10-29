import React, { useState } from 'react';
import { Search, X, Loader2, Barcode, Plus } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
  loading?: boolean;
  placeholder?: string;
  totalCount?: number;
  onOpenCreate?: () => void;
  onOpenScanner?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  onClear,
  loading = false,
  placeholder,
  totalCount,
  onOpenCreate,
  onOpenScanner
}) => {
  const [keyboardMode, setKeyboardMode] = useState<'numeric' | 'text'>('numeric');

  const defaultPlaceholder = keyboardMode === 'numeric'
    ? 'Nhập mã vạch hoặc mã...'
    : 'Tìm kiếm sản phẩm...';

  return (
    <div className="space-y-2 mb-3">
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          {loading ? (
            <Loader2 className="animate-spin text-blue-600" size={20} />
          ) : (
            <Search size={20} />
          )}
        </div>

        <input
          type="text"
          inputMode={keyboardMode}
          pattern={keyboardMode === 'numeric' ? '[0-9]*' : undefined}
          autoComplete="off"
          placeholder={placeholder || defaultPlaceholder}
          className="w-full py-3 pl-12 pr-28 bg-white border border-slate-200/90 rounded-2xl shadow-sm text-[0.95rem] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
          value={value}
          onChange={e => onChange(e.target.value)}
        />

        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {value && (
            <button
              type="button"
              onClick={onClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
              title="Xóa tìm kiếm"
            >
              <X size={16} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setKeyboardMode(prev => prev === 'numeric' ? 'text' : 'numeric')}
            className={`text-[0.72rem] font-bold px-2 py-1 rounded-xl border transition-all flex items-center gap-1 cursor-pointer ${
              keyboardMode === 'numeric'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-slate-100 border-slate-200 text-slate-600'
            }`}
            title="Đổi loại bàn phím (Số / Chữ)"
          >
            {keyboardMode === 'numeric' ? '🔢 Số' : '🔤 Chữ'}
          </button>
        </div>
      </div>

      <div className="flex justify-end items-center px-1 text-xs gap-1.5">
        {onOpenScanner && (
          <button
            type="button"
            onClick={onOpenScanner}
            className="font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 active:scale-95 shadow-sm cursor-pointer"
            title="Quét mã vạch"
          >
            <Barcode size={16} />
            <span>Quét</span>
          </button>
        )}
        {onOpenCreate && (
          <button
            type="button"
            onClick={onOpenCreate}
            className="font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 border border-blue-200/60 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
          >
            <Plus size={15} />
            <span>Mới</span>
          </button>
        )}
      </div>
    </div>
  );
};
