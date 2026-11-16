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
    <div className="space-y-3 mb-4">
      <div className="relative bg-white/95 backdrop-blur-md rounded-2xl shadow-apple border-0 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
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
          className="w-full py-3.5 pl-12 pr-32 bg-transparent border-0 rounded-2xl text-[0.95rem] font-medium text-slate-800 placeholder:text-slate-400 outline-none transition-all"
          value={value}
          onChange={e => onChange(e.target.value)}
        />

        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {value && (
            <button
              type="button"
              onClick={onClear}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors border-0 cursor-pointer"
              title="Xóa tìm kiếm"
            >
              <X size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setKeyboardMode(prev => prev === 'numeric' ? 'text' : 'numeric')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all flex items-center gap-1 cursor-pointer border-0 ${
              keyboardMode === 'numeric'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title="Đổi loại bàn phím (Số / Chữ)"
          >
            {keyboardMode === 'numeric' ? '🔢 Số' : '🔤 Chữ'}
          </button>
        </div>
      </div>

      <div className="flex justify-end items-center px-1 text-xs gap-2">
        {onOpenScanner && (
          <button
            type="button"
            onClick={onOpenScanner}
            className="font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100/90 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 active:scale-95 shadow-apple-soft cursor-pointer border-0"
            title="Quét mã vạch"
          >
            <Barcode size={15} />
            <span>Quét</span>
          </button>
        )}
        {onOpenCreate && (
          <button
            type="button"
            onClick={onOpenCreate}
            className="font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100/90 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1 active:scale-95 shadow-apple-soft cursor-pointer border-0"
          >
            <Plus size={15} />
            <span>Thêm mới</span>
          </button>
        )}
      </div>
    </div>
  );
};
