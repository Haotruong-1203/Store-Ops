import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Calendar, AlertCircle, Receipt, Sparkles, Package } from 'lucide-react';
import { Header, InputGroup } from '../components/SharedUI';
import { SearchBar } from '../components/SearchBar';
import { ProductList } from '../components/ProductList';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { useProductPagination } from '../hooks/useProductPagination';
import { useProductSearch } from '../hooks/useProductSearch';
import { 
  Product, 
  ExpiryRecord, 
  addProductOnline, 
  updateProductOnline, 
  deleteProductOnline 
} from '../lib/firestoreService';
import { calculateDestructionDate, getProductRecords } from '../lib/utils';
import { saveProductExpiry, deleteProductExpiry } from '../lib/expiryService';
import { invalidateBarcodeCache } from '../hooks/useBarcodeSearch';

export interface CheckScreenProps {
  onBack: () => void;
  // Backward compatibility with App.tsx props
  products?: Product[];
  onAdd?: (p: Omit<Product, 'id'>) => Promise<void>;
  onUpdate?: (p: Product) => Promise<void>;
  onDelete?: (id: string | number) => void;
}

export const CheckScreen: React.FC<CheckScreenProps> = ({ 
  onBack, 
  onAdd, 
  onUpdate, 
  onDelete,
  products = []
}) => {
  const {
    products: paginatedProducts,
    loading: loadingPagination,
    loadingMore,
    hasMore,
    loadMore,
    reset: resetPagination,
    updateProductLocally: updatePaginationLocally,
    removeProductLocally: removePaginationLocally,
    addProductLocally: addPaginationLocally,
    totalLoaded,
    error: paginationError
  } = useProductPagination(50);

  const {
    searchTerm,
    setSearchTerm,
    debouncedTerm,
    results: searchResults,
    loading: loadingSearch,
    isSearching,
    clearSearch,
    updateResultLocally,
    removeResultLocally
  } = useProductSearch(300);

  const fallbackList = paginatedProducts.length > 0 ? paginatedProducts : (products || []);
  const displayProducts = isSearching ? searchResults : fallbackList;
  const isLoading = isSearching ? loadingSearch : loadingPagination;

  // Modals state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    barcode: '',
    name: '',
    internalCode: '',
    destroyDaysBeforeExpiry: '0',
    price: '',
    expDate: '',
    destructionDate: '',
    quantity: '',
    note: ''
  });

  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProductForm, setEditProductForm] = useState({
    barcode: '',
    name: '',
    internalCode: '',
    destroyDaysBeforeExpiry: '0',
    price: ''
  });

  const [selectedProductForRecord, setSelectedProductForRecord] = useState<Product | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [newRecordForm, setNewRecordForm] = useState({
    expDate: '',
    destroyDays: '0',
    destructionDate: '',
    quantity: '',
    note: ''
  });

  // Modal Handlers
  const handleOpenCreateProduct = (barcodeValue?: string) => {
    const code = barcodeValue !== undefined ? barcodeValue : searchTerm.trim();
    setNewProductForm({
      barcode: code,
      name: '',
      internalCode: '',
      destroyDaysBeforeExpiry: '0',
      price: '',
      expDate: '',
      destructionDate: '',
      quantity: '',
      note: ''
    });
    setIsAddProductModalOpen(true);
  };

  const handleOpenEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditProductForm({
      barcode: product.barcode,
      name: product.name,
      internalCode: product.internalCode || '',
      destroyDaysBeforeExpiry: String(product.destroyDaysBeforeExpiry ?? 0),
      price: String(product.price || '')
    });
    setIsEditProductModalOpen(true);
  };

  const handleSaveEditProduct = async () => {
    if (!editingProduct) return;
    if (!editProductForm.barcode.trim()) {
      alert('Vui lòng nhập mã vạch (Barcode)!');
      return;
    }
    if (!editProductForm.name.trim()) {
      alert('Vui lòng nhập tên sản phẩm!');
      return;
    }

    const updatedProd: Product = {
      ...editingProduct,
      barcode: editProductForm.barcode.trim(),
      name: editProductForm.name.trim(),
      internalCode: editProductForm.internalCode.trim() || undefined,
      destroyDaysBeforeExpiry: editProductForm.destroyDaysBeforeExpiry === '' || isNaN(parseInt(editProductForm.destroyDaysBeforeExpiry)) ? 0 : parseInt(editProductForm.destroyDaysBeforeExpiry),
      price: parseInt(editProductForm.price) || 0,
      updatedAt: new Date().toISOString()
    };

    // Update in Firestore
    if (onUpdate) {
      await onUpdate(updatedProd);
    } else {
      await updateProductOnline(updatedProd);
    }

    // Update local state without reloading all
    updatePaginationLocally(updatedProd);
    updateResultLocally(updatedProd);
    
    setIsEditProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!product.id) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${product.name}" khỏi hệ thống?`)) return;

    if (onDelete) {
      await onDelete(product.id);
    } else {
      await deleteProductOnline(product.id);
    }

    removePaginationLocally(product.id);
    removeResultLocally(product.id);
  };

  const handleNewProductExpChange = (expDate: string, daysBefore: string) => {
    const calc = calculateDestructionDate(expDate, daysBefore === '' || isNaN(parseInt(daysBefore)) ? 0 : parseInt(daysBefore));
    setNewProductForm(prev => ({
      ...prev,
      expDate,
      destroyDaysBeforeExpiry: daysBefore,
      destructionDate: calc
    }));
  };

  const handleSaveNewProduct = async () => {
    if (!newProductForm.barcode.trim()) {
      alert('Vui lòng nhập mã vạch (Barcode)!');
      return;
    }
    if (!newProductForm.name.trim()) {
      alert('Vui lòng nhập tên sản phẩm!');
      return;
    }

    const destroyDaysNum = newProductForm.destroyDaysBeforeExpiry === '' || isNaN(parseInt(newProductForm.destroyDaysBeforeExpiry)) ? 0 : parseInt(newProductForm.destroyDaysBeforeExpiry);
    const initialRecords: ExpiryRecord[] = [];

    if (newProductForm.expDate) {
      const destDate = newProductForm.destructionDate || calculateDestructionDate(newProductForm.expDate, destroyDaysNum);
      initialRecords.push({
        id: 'rec-' + Date.now(),
        expDate: newProductForm.expDate,
        destructionDate: destDate,
        quantity: parseInt(newProductForm.quantity) || undefined,
        note: newProductForm.note.trim() || undefined,
        createdAt: new Date().toISOString()
      });
    }

    const newProdData: Omit<Product, 'id'> = {
      barcode: newProductForm.barcode.trim(),
      name: newProductForm.name.trim(),
      internalCode: newProductForm.internalCode.trim() || undefined,
      destroyDaysBeforeExpiry: destroyDaysNum,
      price: parseInt(newProductForm.price) || 0,
      destructionDate: initialRecords.length > 0 ? initialRecords[0].destructionDate : '',
      expiryRecords: initialRecords
    };

    let createdId: string | undefined;
    if (onAdd) {
      await onAdd(newProdData);
    } else {
      createdId = await addProductOnline(newProdData, 'all');
    }

    const createdProd: Product = {
      ...newProdData,
      id: createdId || 'prod_' + Date.now()
    };

    // Prepend to current list
    addPaginationLocally(createdProd);
    
    setIsAddProductModalOpen(false);
    // Keep search focused on this barcode to show it immediately
    setSearchTerm(newProductForm.barcode.trim());
  };

  const handleOpenAddRecord = (product: Product) => {
    setSelectedProductForRecord(product);
    const defaultDays = String(product.destroyDaysBeforeExpiry ?? 0);
    setNewRecordForm({
      expDate: '',
      destroyDays: defaultDays,
      destructionDate: '',
      quantity: '',
      note: ''
    });
  };

  const handleNewRecordExpChange = (expDate: string, daysBefore: string) => {
    const calc = calculateDestructionDate(expDate, daysBefore === '' || isNaN(parseInt(daysBefore)) ? 0 : parseInt(daysBefore));
    setNewRecordForm(prev => ({
      ...prev,
      expDate,
      destroyDays: daysBefore,
      destructionDate: calc
    }));
  };

  const handleSaveRecord = async () => {
    if (!selectedProductForRecord || !newRecordForm.expDate) {
      alert('Vui lòng chọn Hạn sử dụng (HSD)!');
      return;
    }

    const daysBefore = newRecordForm.destroyDays === '' || isNaN(parseInt(newRecordForm.destroyDays)) ? 0 : parseInt(newRecordForm.destroyDays);

    setIsSavingRecord(true);
    try {
      const updatedProduct = await saveProductExpiry(
        {
          barcode: selectedProductForRecord.barcode,
          exp_date: newRecordForm.expDate,
          destroy_days: daysBefore
        },
        selectedProductForRecord
      );
      invalidateBarcodeCache(selectedProductForRecord.barcode);
      if (onUpdate) {
        await onUpdate(updatedProduct);
      }

      updatePaginationLocally(updatedProduct);
      updateResultLocally(updatedProduct);
      setSelectedProductForRecord(null);
      alert('Đã lưu hạn sử dụng thành công!');
    } catch (err: any) {
      console.error('Error saving expiry record:', err);
      alert('Lỗi khi lưu hạn sử dụng: ' + (err.message || 'Không thể lưu đợt HSD'));
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (product: Product, _recordId: string) => {
    if (!confirm('Bạn có chắc muốn xóa hạn sử dụng này không?')) return;
    await deleteProductExpiry(product.barcode, product.id);
    invalidateBarcodeCache(product.barcode);
    
    const updatedProduct: Product = {
      ...product,
      destructionDate: '',
      expiryRecords: [],
      updatedAt: new Date().toISOString()
    };

    if (onUpdate) {
      await onUpdate(updatedProduct);
    }

    updatePaginationLocally(updatedProduct);
    updateResultLocally(updatedProduct);
  };

  const inputClass = "w-full max-w-full box-border block px-4 py-3.5 bg-slate-100/80 border-0 rounded-2xl text-[0.95rem] font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs";

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      <Header title="TÌM & KIỂM HÀNG" onBack={onBack} />

      {/* Optimized Search Bar with Debounce & Keyboard mode toggle */}
      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        onClear={clearSearch}
        loading={loadingSearch}
        totalCount={displayProducts.length}
        onOpenCreate={() => handleOpenCreateProduct()}
        onOpenScanner={() => setScannerOpen(true)}
      />

      {/* Selected / Scanned Product Banner Feedback */}
      {selectedProduct && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-4 bg-white/95 backdrop-blur-md rounded-2xl flex items-center justify-between gap-3 shadow-apple-soft border-0 shrink-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-ping" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border-0">
                  Đã quét
                </span>
                <span className="text-sm font-bold text-slate-900 truncate">
                  {selectedProduct.name}
                </span>
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">
                Mã: {selectedProduct.barcode}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedProduct(null)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3.5 py-1.5 rounded-full shrink-0 transition-colors border-0 cursor-pointer"
          >
            Bỏ chọn
          </button>
        </motion.div>
      )}

      {/* Database status banners */}
      {paginationError && (paginationError.includes('Could not find the table') || paginationError.includes('PGRST205')) && (
        <div className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 shadow-sm shrink-0">
          <div className="flex items-center gap-2 font-bold text-sm mb-1 text-amber-800">
            <AlertCircle className="text-amber-600 shrink-0" size={18} />
            <span>Chưa tạo bảng trong Supabase!</span>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            Database Supabase chưa có bảng <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">products</code>. Bạn hãy vào trang <strong>Supabase Dashboard &gt; SQL Editor</strong>, dán đoạn mã SQL được cung cấp và nhấn <strong>Run</strong> để tạo bảng nhé!
          </p>
        </div>
      )}

      {!isLoading && !paginationError && displayProducts.length === 0 && !debouncedTerm && (
        <div className="mb-4 p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 shadow-sm shrink-0 text-center">
          <div className="flex items-center justify-center gap-2 font-bold text-sm mb-1 text-blue-800">
            <Package className="text-blue-600 shrink-0" size={18} />
            <span>Database Supabase chưa có sản phẩm</span>
          </div>
          <p className="text-xs text-blue-700 leading-relaxed mb-1">
            Sau khi chuyển sang Supabase, database hiện tại đang trống (0 sản phẩm).
          </p>
          <p className="text-xs font-semibold text-blue-800">
            👉 Vui lòng vào tab <strong>"Dữ liệu"</strong> (mục Item Bán) để tải lên file Excel / CSV của bạn.
          </p>
        </div>
      )}

      {/* Virtualized Product List */}
      <ProductList
        products={displayProducts}
        loading={isLoading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onEdit={handleOpenEditProduct}
        onDelete={handleDeleteProduct}
        onAddRecord={handleOpenAddRecord}
        onDeleteRecord={handleDeleteRecord}
        searchTerm={debouncedTerm}
        isSearching={isSearching}
        onOpenCreateWithCode={handleOpenCreateProduct}
      />

      {/* MODAL: TẠO MỚI SẢN PHẨM */}
      <AnimatePresence>
        {isAddProductModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs"
              onClick={() => setIsAddProductModalOpen(false)}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white/95 backdrop-blur-md rounded-t-[2.5rem] sm:rounded-3xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-apple-lg border-0 z-10"
            >
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Plus className="text-blue-600" size={24} /> Tạo mới sản phẩm
                </h2>
                <button 
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors border-0 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* QUICK SCAN PRICE TAG OPTION */}
              <div className="mb-5 p-4 bg-amber-50/80 rounded-2xl flex flex-col gap-2.5 border-0 shadow-apple-soft">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                  <Sparkles size={16} className="text-amber-600 shrink-0" />
                  Bạn có tem/bảng giá sản phẩm?
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddProductModalOpen(false);
                    setScannerOpen(true);
                  }}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white rounded-full text-xs font-semibold flex items-center justify-center gap-2 shadow-apple-soft transition-all cursor-pointer border-0"
                >
                  <Receipt size={16} />
                  Quét bảng giá để tự động nhập
                </button>
              </div>

              <div className="space-y-4">
                <InputGroup label="Mã vạch *">
                  <input 
                    type="text" 
                    inputMode="numeric" 
                    pattern="[0-9]*"
                    autoComplete="off"
                    placeholder="Mã vạch sản phẩm" 
                    className={`${inputClass} font-mono font-bold`} 
                    value={newProductForm.barcode} 
                    onChange={e => setNewProductForm({ ...newProductForm, barcode: e.target.value })} 
                  />
                </InputGroup>

                <InputGroup label="Tên sản phẩm *">
                  <input 
                    type="text" 
                    placeholder="Nhập tên sản phẩm" 
                    className={inputClass} 
                    value={newProductForm.name} 
                    onChange={e => setNewProductForm({ ...newProductForm, name: e.target.value })} 
                  />
                </InputGroup>

                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Mã nội bộ">
                    <input 
                      type="text" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      autoComplete="off"
                      maxLength={8}
                      placeholder="Tối đa 8 số" 
                      className={`${inputClass} font-mono`} 
                      value={newProductForm.internalCode} 
                      onChange={e => setNewProductForm({ ...newProductForm, internalCode: e.target.value })} 
                    />
                  </InputGroup>
                  <InputGroup label="Giá bán (VNĐ)">
                    <input 
                      type="text" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="0" 
                      className={`${inputClass} font-bold text-blue-600`} 
                      value={newProductForm.price} 
                      onChange={e => setNewProductForm({ ...newProductForm, price: e.target.value })} 
                    />
                  </InputGroup>
                </div>

                <div className="p-5 bg-slate-100/70 rounded-2xl space-y-3.5 border-0">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={14} className="text-blue-500" /> Hạn sử dụng đầu tiên (Tùy chọn)
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <InputGroup label="Hạn sử dụng (HSD)">
                      <input 
                        type="date" 
                        className={inputClass} 
                        value={newProductForm.expDate} 
                        onChange={e => handleNewProductExpChange(e.target.value, newProductForm.destroyDaysBeforeExpiry)} 
                      />
                    </InputGroup>

                    <InputGroup label="Số ngày hủy trước">
                      <input 
                        type="number" 
                        className={inputClass} 
                        value={newProductForm.destroyDaysBeforeExpiry} 
                        onChange={e => handleNewProductExpChange(newProductForm.expDate, e.target.value)} 
                      />
                    </InputGroup>
                  </div>

                  {newProductForm.destructionDate && (
                    <div className="p-3.5 bg-amber-50/90 rounded-2xl text-xs font-semibold text-amber-800 flex items-center justify-between border-0">
                      <span>Ngày phải hủy tính được:</span>
                      <span className="font-mono font-bold text-amber-900">{newProductForm.destructionDate}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <InputGroup label="Số lượng">
                      <input 
                        type="number" 
                        placeholder="SL" 
                        className={inputClass} 
                        value={newProductForm.quantity} 
                        onChange={e => setNewProductForm({ ...newProductForm, quantity: e.target.value })} 
                      />
                    </InputGroup>

                    <InputGroup label="Ghi chú">
                      <input 
                        type="text" 
                        placeholder="Ghi chú thêm" 
                        className={inputClass} 
                        value={newProductForm.note} 
                        onChange={e => setNewProductForm({ ...newProductForm, note: e.target.value })} 
                      />
                    </InputGroup>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsAddProductModalOpen(false)} 
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-full transition-all border-0 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button 
                    type="button" 
                    onClick={handleSaveNewProduct} 
                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full shadow-apple-soft transition-all border-0 cursor-pointer"
                  >
                    Lưu sản phẩm
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: CHỈNH SỬA SẢN PHẨM */}
      <AnimatePresence>
        {isEditProductModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs"
              onClick={() => setIsEditProductModalOpen(false)}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white/95 backdrop-blur-md rounded-t-[2.5rem] sm:rounded-3xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-apple-lg border-0 z-10"
            >
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold text-slate-900">Chỉnh sửa sản phẩm</h2>
                <button 
                  onClick={() => setIsEditProductModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors border-0 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <InputGroup label="Mã vạch *">
                  <input 
                    type="text" 
                    inputMode="numeric" 
                    pattern="[0-9]*"
                    autoComplete="off"
                    className={`${inputClass} font-mono font-bold`} 
                    value={editProductForm.barcode} 
                    onChange={e => setEditProductForm({ ...editProductForm, barcode: e.target.value })} 
                  />
                </InputGroup>

                <InputGroup label="Tên sản phẩm *">
                  <input 
                    type="text" 
                    className={inputClass} 
                    value={editProductForm.name} 
                    onChange={e => setEditProductForm({ ...editProductForm, name: e.target.value })} 
                  />
                </InputGroup>

                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Mã nội bộ">
                    <input 
                      type="text" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      autoComplete="off"
                      maxLength={8}
                      className={`${inputClass} font-mono`} 
                      value={editProductForm.internalCode} 
                      onChange={e => setEditProductForm({ ...editProductForm, internalCode: e.target.value })} 
                    />
                  </InputGroup>
                  <InputGroup label="Giá bán (VNĐ)">
                    <input 
                      type="text" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      autoComplete="off"
                      className={`${inputClass} font-bold text-blue-600`} 
                      value={editProductForm.price} 
                      onChange={e => setEditProductForm({ ...editProductForm, price: e.target.value })} 
                    />
                  </InputGroup>
                </div>

                <InputGroup label="Số ngày hủy trước HSD mặc định">
                  <input 
                    type="number" 
                    className={inputClass} 
                    value={editProductForm.destroyDaysBeforeExpiry} 
                    onChange={e => setEditProductForm({ ...editProductForm, destroyDaysBeforeExpiry: e.target.value })} 
                  />
                </InputGroup>

                <div className="pt-2 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsEditProductModalOpen(false)} 
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-full transition-all border-0 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button 
                    type="button" 
                    onClick={handleSaveEditProduct} 
                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full shadow-apple-soft transition-all border-0 cursor-pointer"
                  >
                    Lưu thay đổi
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: THÊM HẠN SỬ DỤNG MỚI */}
      <AnimatePresence>
        {selectedProductForRecord && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs"
              onClick={() => setSelectedProductForRecord(null)}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white/95 backdrop-blur-md rounded-t-[2.5rem] sm:rounded-3xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-apple-lg border-0 z-10"
            >
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="text-emerald-600" size={24} /> Thêm đợt HSD
                  </h2>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5 truncate max-w-[280px]">
                    {selectedProductForRecord.name}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedProductForRecord(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors border-0 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Hạn sử dụng (HSD) *">
                    <input 
                      type="date" 
                      className={inputClass} 
                      value={newRecordForm.expDate} 
                      onChange={e => handleNewRecordExpChange(e.target.value, newRecordForm.destroyDays)} 
                    />
                  </InputGroup>

                  <InputGroup label="Số ngày hủy trước">
                    <input 
                      type="number" 
                      className={inputClass} 
                      value={newRecordForm.destroyDays} 
                      onChange={e => handleNewRecordExpChange(newRecordForm.expDate, e.target.value)} 
                    />
                  </InputGroup>
                </div>

                {newRecordForm.destructionDate && (
                  <div className="p-3.5 bg-amber-50/90 rounded-2xl text-xs font-semibold text-amber-800 flex items-center justify-between border-0">
                    <span>Ngày phải hủy:</span>
                    <span className="font-mono font-bold text-amber-900">{newRecordForm.destructionDate}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Số lượng">
                    <input 
                      type="number" 
                      placeholder="SL" 
                      className={inputClass} 
                      value={newRecordForm.quantity} 
                      onChange={e => setNewRecordForm({ ...newRecordForm, quantity: e.target.value })} 
                    />
                  </InputGroup>

                  <InputGroup label="Ghi chú">
                    <input 
                      type="text" 
                      placeholder="Ghi chú thêm" 
                      className={inputClass} 
                      value={newRecordForm.note} 
                      onChange={e => setNewRecordForm({ ...newRecordForm, note: e.target.value })} 
                    />
                  </InputGroup>
                </div>

                <div className="pt-2 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setSelectedProductForRecord(null)} 
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-full transition-all border-0 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button 
                    type="button" 
                    onClick={handleSaveRecord} 
                    disabled={isSavingRecord}
                    className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-full shadow-apple-soft transition-all border-0 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSavingRecord ? 'Đang lưu...' : 'Thêm đợt HSD'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BARCODE SCANNER MODAL */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onProductFound={(prod) => {
          setSelectedProduct(prod);
          setSearchTerm(prod.barcode);
          setScannerOpen(false);
        }}
        onOpenCreate={(code) => {
          setScannerOpen(false);
          handleOpenCreateProduct(code);
        }}
      />
    </motion.div>
  );
};
