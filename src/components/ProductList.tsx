import React, { useRef, useState, useEffect } from 'react';
import { List } from 'react-window';
import { motion } from 'motion/react';
import { Loader2, Plus, Barcode as BarcodeIcon, PackageOpen } from 'lucide-react';
import { Product } from '../lib/firestoreService';
import { ProductItem } from './ProductItem';
import { EmptyState } from './SharedUI';

interface ProductListProps {
  products: Product[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onAddRecord: (product: Product) => void;
  onDeleteRecord: (product: Product, recordId: string) => void;
  searchTerm?: string;
  isSearching?: boolean;
  onOpenCreateWithCode?: (code: string) => void;
}

interface CustomRowProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onAddRecord: (product: Product) => void;
  onDeleteRecord: (product: Product, recordId: string) => void;
}

const Row = ({ 
  index, 
  style, 
  products, 
  onEdit, 
  onDelete, 
  onAddRecord, 
  onDeleteRecord 
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes?: any;
} & CustomRowProps) => {
  const product = products[index];
  if (!product) return null;

  return (
    <div style={style} className="pb-3.5 box-border px-0.5">
      <ProductItem
        product={product}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddRecord={onAddRecord}
        onDeleteRecord={onDeleteRecord}
        showBarcodeImage={true}
      />
    </div>
  );
};

export const ProductList: React.FC<ProductListProps> = ({
  products,
  loading,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  onEdit,
  onDelete,
  onAddRecord,
  onDeleteRecord,
  searchTerm = '',
  isSearching = false,
  onOpenCreateWithCode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 380,
    height: 580
  });

  // Dynamically measure container dimensions for react-window
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const availableHeight = Math.max(300, window.innerHeight - rect.top - 100);
        setDimensions({
          width: rect.width || 380,
          height: availableHeight
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const isSearchNotFound = isSearching && !loading && products.length === 0;

  // Skeleton loading view
  if (loading && products.length === 0) {
    return (
      <div className="space-y-3 pb-20">
        {[1, 2, 3, 4].map(idx => (
          <div 
            key={idx} 
            className="bg-white/90 backdrop-blur-md rounded-3xl p-5 shadow-apple animate-pulse space-y-3 border-0"
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-slate-200 rounded-md w-3/4"></div>
                <div className="h-4 bg-slate-100 rounded-md w-1/3"></div>
              </div>
              <div className="h-5 bg-slate-200 rounded-md w-16"></div>
            </div>
            <div className="h-10 bg-slate-50 rounded-xl"></div>
            <div className="flex justify-end gap-2 pt-2 ">
              <div className="h-7 bg-slate-200 rounded-lg w-16"></div>
              <div className="h-7 bg-slate-200 rounded-lg w-16"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex flex-col flex-1 min-h-[400px]">
      {/* Search Not Found Prompt */}
      {isSearchNotFound && (
        <motion.div 
          initial={{ opacity: 0, y: -8 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-4 p-6 bg-slate-100/80 rounded-3xl text-center shadow-apple border-0"
        >
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
            <BarcodeIcon size={24} />
          </div>
          <h3 className="font-extrabold text-slate-800 text-[1rem] mb-1">
            Không tìm thấy sản phẩm
          </h3>
          <p className="text-slate-600 text-[0.85rem] mb-3">
            Từ khóa <span className="font-mono font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">{searchTerm}</span> chưa có trong hệ thống dữ liệu.
          </p>
          {onOpenCreateWithCode && (
            <button 
              type="button"
              onClick={() => onOpenCreateWithCode(searchTerm)}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-apple active:scale-95 transition-all flex items-center justify-center gap-2 text-[0.92rem] border-0 cursor-pointer"
            >
              <Plus size={18} /> Tạo mới sản phẩm với mã này
            </button>
          )}
        </motion.div>
      )}

      {products.length === 0 && !isSearchNotFound ? (
        <EmptyState 
          icon={<PackageOpen size={48} />} 
          message="Chưa có sản phẩm nào trong danh mục." 
        />
      ) : (
        <>
          {/* Virtualized list using react-window */}
          <div className="flex-1 rounded-2xl overflow-hidden">
            <List<CustomRowProps>
              rowCount={products.length}
              rowHeight={245}
              rowComponent={Row}
              rowProps={{
                products,
                onEdit,
                onDelete,
                onAddRecord,
                onDeleteRecord
              }}
              onRowsRendered={(visibleRows) => {
                if (hasMore && !loadingMore && onLoadMore && visibleRows.stopIndex >= products.length - 4) {
                  onLoadMore();
                }
              }}
              style={{ height: dimensions.height, width: dimensions.width }}
            />
          </div>

          {/* Load More Footer Button / Indicator */}
          {!isSearching && (
            <div className="py-3 flex flex-col items-center justify-center gap-2">
              {loadingMore ? (
                <div className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl">
                  <Loader2 className="animate-spin" size={16} />
                  <span>Đang tải thêm 50 sản phẩm tiếp theo...</span>
                </div>
              ) : hasMore && onLoadMore ? (
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="px-6 py-3 bg-white/95 hover:bg-white text-slate-700 hover:text-blue-600 font-bold text-xs rounded-full shadow-apple-soft hover:shadow-apple active:scale-95 transition-all flex items-center gap-2 border-0 cursor-pointer"
                >
                  <span>Tải thêm 50 sản phẩm</span>
                  <span className="text-[0.7rem] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold">
                    Đã tải {products.length}
                  </span>
                </button>
              ) : products.length > 0 ? (
                <div className="text-[0.75rem] font-semibold text-slate-400">
                  Đã tải tất cả {products.length} sản phẩm
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
};
