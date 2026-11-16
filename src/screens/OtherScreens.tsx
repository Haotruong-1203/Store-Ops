import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Barcode from 'react-barcode';
import * as XLSX from 'xlsx';
import { 
  Search, 
  Clock, 
  DollarSign, 
  Download, 
  Upload, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Trash,
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  X,
  Barcode as BarcodeIcon,
  Tag,
  Layers,
  ChevronRight,
  Camera,
  BadgeInfo,
  FileSpreadsheet,
  FileDown,
  RotateCcw,
  FileText,
  Copy,
  Check,
  HelpCircle,
  Lock,
  Loader2
} from 'lucide-react';
import { Header, Card, EmptyState, InputGroup } from '../components/SharedUI';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { Product, ExpiryRecord, clearProductsCollection, addProductsBulk, updateProductOnline } from '../lib/firestoreService';
import { 
  EnrichedExpiryItem, 
  subscribeProductExpiries, 
  saveProductExpiry, 
  deleteProductExpiry 
} from '../lib/expiryService';
import { useProductSearch } from '../hooks/useProductSearch';
import { invalidateBarcodeCache } from '../hooks/useBarcodeSearch';
import { subscribeConsumables, addConsumablesBulk, clearConsumablesCollection, ConsumableItem } from '../lib/consumableService';
import { supabase } from '../lib/supabase';
import { 
  formatDate, 
  getStatus, 
  calculateDestructionDate, 
  getProductRecords, 
  getEarliestDestructionDate,
  isValidRealExpiryDate 
} from '../lib/utils';

interface CheckScreenProps {
  onBack: () => void;
  products: Product[];
  onAdd?: (p: Omit<Product, 'id'>) => Promise<void>;
  onUpdate?: (p: Product) => Promise<void>;
  onDelete?: (id: string | number) => void;
}

export const CheckScreen: React.FC<CheckScreenProps> = ({ 
  onBack, 
  products, 
  onAdd, 
  onUpdate, 
  onDelete 
}) => {
  const [search, setSearch] = useState('');
  const [searchKeyboardMode, setSearchKeyboardMode] = useState<'numeric' | 'text'>('numeric');
  
  // Modal for creating a new product from non-existent barcode
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

  // Modal for editing an existing product
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProductForm, setEditProductForm] = useState({
    barcode: '',
    name: '',
    internalCode: '',
    destroyDaysBeforeExpiry: '0',
    price: ''
  });

  // Modal for adding a new expiry record to an existing product
  const [selectedProductForRecord, setSelectedProductForRecord] = useState<Product | null>(null);
  const [newRecordForm, setNewRecordForm] = useState({
    expDate: '',
    destroyDays: '0',
    destructionDate: '',
    quantity: '',
    note: ''
  });

  // Search matching
  const searchLower = search.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (!searchLower) return products;
    return products.filter(p => 
      p.name.toLowerCase().includes(searchLower) || 
      p.barcode.toLowerCase().includes(searchLower) ||
      (p.internalCode && p.internalCode.toLowerCase().includes(searchLower))
    );
  }, [products, searchLower]);

  // Check if search string is a barcode that does not exist in DB
  const isSearchNotFound = search.trim().length > 0 && filteredProducts.length === 0;

  // Open modal to create a new product with prefilled barcode
  const handleOpenCreateProduct = (barcodeValue?: string) => {
    const code = barcodeValue !== undefined ? barcodeValue : search.trim();
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
    };

    if (onUpdate) {
      await onUpdate(updatedProd);
    }
    
    setIsEditProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (onDelete && product.id) {
      await onDelete(product.id);
    }
  };

  // Recalculate destructionDate when expDate or destroyDays changes in new product form
  const handleNewProductExpChange = (expDate: string, daysBefore: string) => {
    const calc = calculateDestructionDate(expDate, daysBefore === '' || isNaN(parseInt(daysBefore)) ? 0 : parseInt(daysBefore));
    setNewProductForm(prev => ({
      ...prev,
      expDate,
      destroyDaysBeforeExpiry: daysBefore,
      destructionDate: calc
    }));
  };

  // Save new product
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
    let initialRecords: ExpiryRecord[] = [];

    // If initial expiry date is entered, create first record
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

    const newProd: Omit<Product, 'id'> = {
      barcode: newProductForm.barcode.trim(),
      name: newProductForm.name.trim(),
      internalCode: newProductForm.internalCode.trim() || undefined,
      destroyDaysBeforeExpiry: destroyDaysNum,
      price: parseInt(newProductForm.price) || 0,
      destructionDate: initialRecords.length > 0 ? initialRecords[0].destructionDate : '',
      expiryRecords: initialRecords
    };

    if (onAdd) {
      await onAdd(newProd);
    }
    
    setIsAddProductModalOpen(false);
    // Keep search focused on this barcode to show it immediately
    setSearch(newProductForm.barcode.trim());
  };

  // Open modal to add an expiry record to an existing product
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

  // Recalculate destructionDate when expDate changes in new record form
  const handleNewRecordExpChange = (expDate: string, daysBefore: string) => {
    const calc = calculateDestructionDate(expDate, daysBefore === '' || isNaN(parseInt(daysBefore)) ? 0 : parseInt(daysBefore));
    setNewRecordForm(prev => ({
      ...prev,
      expDate,
      destroyDays: daysBefore,
      destructionDate: calc
    }));
  };

  // Save new expiry record to product
  const handleSaveRecord = async () => {
    if (!selectedProductForRecord || !newRecordForm.expDate) {
      alert('Vui lòng chọn Hạn sử dụng (HSD)!');
      return;
    }

    const daysBefore = newRecordForm.destroyDays === '' || isNaN(parseInt(newRecordForm.destroyDays)) ? 0 : parseInt(newRecordForm.destroyDays);
    const finalDestructionDate = newRecordForm.destructionDate || calculateDestructionDate(newRecordForm.expDate, daysBefore);

    const newRecord: ExpiryRecord = {
      id: 'rec-' + Date.now(),
      expDate: newRecordForm.expDate,
      destructionDate: finalDestructionDate,
      quantity: parseInt(newRecordForm.quantity) || undefined,
      note: newRecordForm.note.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    const currentRecords = getProductRecords(selectedProductForRecord);
    const updatedRecords = [...currentRecords, newRecord].sort(
      (a, b) => new Date(a.destructionDate).getTime() - new Date(b.destructionDate).getTime()
    );

    const updatedProduct: Product = {
      ...selectedProductForRecord,
      destructionDate: updatedRecords[0].destructionDate,
      expiryRecords: updatedRecords
    };

    if (onUpdate) {
      await onUpdate(updatedProduct);
    }

    setSelectedProductForRecord(null);
  };

  // Delete an expiry record from product
  const handleDeleteRecord = async (product: Product, recordId: string) => {
    if (!confirm('Bạn có chắc muốn xóa record hạn sử dụng này không?')) return;
    const currentRecords = getProductRecords(product);
    const filteredRecords = currentRecords.filter(r => r.id !== recordId);
    
    const updatedProduct: Product = {
      ...product,
      destructionDate: filteredRecords.length > 0 ? filteredRecords[0].destructionDate : '',
      expiryRecords: filteredRecords
    };

    if (onUpdate) {
      await onUpdate(updatedProduct);
    }
  };

  const inputClass = "w-full max-w-full box-border block px-4 py-3.5 bg-slate-100/80 border-0 rounded-2xl text-[0.95rem] font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs";

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <Header title="TÌM & KIỂM HÀNG" onBack={onBack} />
      
      {/* Search Input Bar */}
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            inputMode={searchKeyboardMode}
            pattern={searchKeyboardMode === 'numeric' ? '[0-9]*' : undefined}
            autoComplete="off"
            placeholder={searchKeyboardMode === 'numeric' ? 'Nhập mã vạch hoặc mã nội bộ (bàn phím số)...' : 'Nhập tên sản phẩm để tìm...'} 
            className="w-full py-3.5 pl-12 pr-28 bg-white/95 rounded-2xl shadow-apple text-[0.95rem] border-0 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            )}
            <button 
              type="button"
              onClick={() => setSearchKeyboardMode(prev => prev === 'numeric' ? 'text' : 'numeric')}
              className={`text-[0.72rem] font-bold px-2 py-1 rounded-xl border-0 transition-all flex items-center gap-1 ${searchKeyboardMode === 'numeric' ? 'bg-blue-50 text-blue-700 border-0 shadow-apple-soft' : 'bg-slate-100 text-slate-600 border-0 shadow-apple-soft'}`}
              title="Đổi loại bàn phím (Số / Chữ)"
            >
              {searchKeyboardMode === 'numeric' ? '🔢 Số' : '🔤 Chữ'}
            </button>
          </div>
        </div>

        {/* Quick action button to add new product */}
        <div className="flex justify-between items-center px-1">
          <span className="text-[0.8rem] font-semibold text-slate-500">
            {filteredProducts.length} sản phẩm
          </span>
          <button 
            onClick={() => handleOpenCreateProduct()}
            className="text-[0.82rem] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 active:scale-95"
          >
            <Plus size={16} /> Thêm sản phẩm mới
          </button>
        </div>
      </div>

      {/* Barcode Not Found Banner -> Direct prompt to create new product with this barcode */}
      {isSearchNotFound && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-5 p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-dashed border-amber-300 rounded-[1.5rem] text-center shadow-sm"
        >
          <div className="w-12 h-12 mx-auto mb-2.5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
            <BarcodeIcon size={24} />
          </div>
          <h3 className="font-extrabold text-slate-800 text-[1rem] mb-1">Mã vạch chưa có trong hệ thống</h3>
          <p className="text-slate-600 text-[0.85rem] mb-3">
            Mã <span className="font-mono font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">{search.trim()}</span> chưa được lưu vào dữ liệu hàng.
          </p>
          <button 
            onClick={() => handleOpenCreateProduct(search.trim())}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 text-[0.95rem]"
          >
            <Plus size={18} /> Tạo mới sản phẩm với mã này
          </button>
        </motion.div>
      )}

      {/* Products List with Multiple Expiry Records */}
      <div className="pb-28 space-y-4">
        {filteredProducts.length === 0 && !isSearchNotFound ? (
          <EmptyState icon={<Search size={48} />} message="Chưa có sản phẩm nào trong kho" />
        ) : (
          filteredProducts.map(product => {
            const records = getProductRecords(product);
            const urgentDate = getEarliestDestructionDate(product);
            const urgentStatus = getStatus(urgentDate);

            return (
              <motion.div 
                key={product.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/90 backdrop-blur-md rounded-3xl p-5 shadow-apple border-0 transition-all"
              >
                {/* Product Header */}
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800 text-[1.05rem] leading-snug">{product.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="inline-flex items-center gap-1 font-mono text-[0.75rem] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        <BarcodeIcon size={13} className="text-slate-400" />
                        {product.barcode}
                      </span>
                      {product.internalCode && (
                        <span className="inline-flex items-center gap-1 text-[0.75rem] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border-0 shadow-apple-soft">
                          <Tag size={12} className="text-indigo-400" />
                          #{product.internalCode}
                        </span>
                      )}
                      {product.destroyDaysBeforeExpiry ? (
                        <span className="text-[0.72rem] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                          Hủy trước HSD: {product.destroyDaysBeforeExpiry} ngày
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-extrabold text-blue-600 text-[1.05rem] block">
                      {(product.price || 0).toLocaleString('vi-VN')}đ
                    </span>
                    {urgentDate && (
                      <span className={`inline-block mt-1 text-[0.7rem] font-bold px-2 py-0.5 rounded-full border ${urgentStatus.badgeCls}`}>
                        {urgentStatus.shortTxt}
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit and Delete Actions */}
                <div className="flex justify-end gap-2 mb-2">
                  <button 
                    onClick={() => handleOpenEditProduct(product)}
                    className="text-[0.75rem] font-bold text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95 border-0 shadow-apple-soft"
                  >
                    Sửa
                  </button>
                  <button 
                    onClick={() => handleDeleteProduct(product)}
                    className="text-[0.75rem] font-bold text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95 border-0 shadow-apple-soft"
                  >
                    <Trash2 size={14} /> Xóa
                  </button>
                </div>

                {product.barcode && product.barcode.length === 13 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-center bg-white/50 rounded-xl overflow-hidden">
                    <Barcode value={product.barcode} format="EAN13" height={40} width={1.5} displayValue={false} margin={5} background="transparent" />
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* MODAL: TẠO MỚI SẢN PHẨM VỚI BARCODE VỪA NHẬP */}
      <AnimatePresence>
        {isAddProductModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsAddProductModalOpen(false)}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 max-h-[90vh] overflow-y-auto shadow-2xl z-10"
            >
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Plus className="text-blue-600" size={24} /> Tạo mới sản phẩm
                </h2>
                <button 
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
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
                    placeholder="Mã vạch sản phẩm" 
                    className={`${inputClass} font-mono font-bold`} 
                    value={newProductForm.barcode} 
                    onChange={e => setNewProductForm({ ...newProductForm, barcode: e.target.value })} 
                  />
                </InputGroup>

                <InputGroup label="Tên sản phẩm *">
                  <input 
                    type="text" 
                    placeholder="Ví dụ: Sữa chua Vinamilk 100g" 
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
                      placeholder="VD: 12345678" 
                      className={`${inputClass} font-mono`} 
                      value={newProductForm.internalCode} 
                      onChange={e => setNewProductForm({ ...newProductForm, internalCode: e.target.value.replace(/\D/g, '') })} 
                    />
                  </InputGroup>

                  <InputGroup label="Giá bán (đ)">
                    <input 
                      type="number" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      placeholder="50000" 
                      min="0" 
                      className={inputClass} 
                      value={newProductForm.price} 
                      onChange={e => setNewProductForm({ ...newProductForm, price: e.target.value })} 
                    />
                  </InputGroup>
                </div>

                <InputGroup label="Số ngày phải huỷ trước HSD *">
                  <input 
                    type="number" 
                    inputMode="numeric" 
                    pattern="[0-9]*"
                    min="0" 
                    placeholder="Ví dụ: 0 (ngày)" 
                    className={inputClass} 
                    value={newProductForm.destroyDaysBeforeExpiry} 
                    onChange={e => handleNewProductExpChange(newProductForm.expDate, e.target.value)} 
                  />
                </InputGroup>

                {/* Initial Expiry Record Form */}
                <div className="bg-slate-50 p-4 rounded-2xl border-0 shadow-apple-soft/80">
                  <div className="text-[0.82rem] font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Calendar size={15} className="text-blue-500" />
                    Thêm hạn sắp hết / Lô đầu tiên (Tùy chọn)
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[0.75rem] font-semibold text-slate-500 mb-1">Hạn sử dụng (HSD)</label>
                      <input 
                        type="date" 
                        className={inputClass} 
                        value={newProductForm.expDate} 
                        onChange={e => handleNewProductExpChange(e.target.value, newProductForm.destroyDaysBeforeExpiry)} 
                      />
                    </div>

                    {newProductForm.expDate && (
                      <div className="p-3 bg-blue-50/80 border-0 shadow-apple-soft rounded-xl text-[0.82rem] flex justify-between items-center">
                        <span className="font-semibold text-blue-900">Ngày phải hủy:</span>
                        <span className="font-mono font-bold text-rose-600 text-[0.95rem]">
                          {formatDate(newProductForm.destructionDate)}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[0.75rem] font-semibold text-slate-500 mb-1">Số lượng (cái/hộp)</label>
                        <input 
                          type="number" 
                          inputMode="numeric" 
                          pattern="[0-9]*"
                          min="0"
                          placeholder="VD: 5" 
                          className={inputClass} 
                          value={newProductForm.quantity} 
                          onChange={e => setNewProductForm({ ...newProductForm, quantity: e.target.value })} 
                        />
                      </div>
                      <div>
                        <label className="block text-[0.75rem] font-semibold text-slate-500 mb-1">Ghi chú lưu ý</label>
                        <input 
                          type="text" 
                          placeholder="VD: Kệ trước" 
                          className={inputClass} 
                          value={newProductForm.note} 
                          onChange={e => setNewProductForm({ ...newProductForm, note: e.target.value })} 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setIsAddProductModalOpen(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl active:scale-95 transition-all text-[0.95rem]"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleSaveNewProduct}
                    className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/30 active:scale-95 transition-all text-[0.95rem]"
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
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsEditProductModalOpen(false)}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 max-h-[90vh] overflow-y-auto shadow-2xl z-10"
            >
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                   Chỉnh sửa sản phẩm
                </h2>
                <button 
                  onClick={() => setIsEditProductModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
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
                    placeholder="Mã vạch sản phẩm" 
                    className={`${inputClass} font-mono font-bold`} 
                    value={editProductForm.barcode} 
                    onChange={e => setEditProductForm({ ...editProductForm, barcode: e.target.value })} 
                  />
                </InputGroup>

                <InputGroup label="Tên sản phẩm *">
                  <input 
                    type="text" 
                    placeholder="Ví dụ: Sữa chua Vinamilk 100g" 
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
                      placeholder="VD: 12345678" 
                      className={`${inputClass} font-mono`} 
                      value={editProductForm.internalCode} 
                      onChange={e => setEditProductForm({ ...editProductForm, internalCode: e.target.value.replace(/\D/g, '') })} 
                    />
                  </InputGroup>

                  <InputGroup label="Giá bán (đ)">
                    <input 
                      type="number" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      placeholder="50000" 
                      min="0" 
                      className={inputClass} 
                      value={editProductForm.price} 
                      onChange={e => setEditProductForm({ ...editProductForm, price: e.target.value })} 
                    />
                  </InputGroup>
                </div>

                <InputGroup label="Số ngày phải huỷ trước HSD *">
                  <input 
                    type="number" 
                    inputMode="numeric" 
                    pattern="[0-9]*"
                    min="0" 
                    placeholder="Ví dụ: 0 (ngày)" 
                    className={inputClass} 
                    value={editProductForm.destroyDaysBeforeExpiry} 
                    onChange={e => setEditProductForm({ ...editProductForm, destroyDaysBeforeExpiry: e.target.value })} 
                  />
                </InputGroup>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setIsEditProductModalOpen(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl active:scale-95 transition-all text-[0.95rem]"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleSaveEditProduct}
                    className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/30 active:scale-95 transition-all text-[0.95rem]"
                  >
                    Lưu thay đổi
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: THÊM HẠN / RECORD MỚI CHO SẢN PHẨM ĐÃ CÓ */}
      <AnimatePresence>
        {selectedProductForRecord && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedProductForRecord(null)}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 max-h-[85vh] overflow-y-auto shadow-2xl z-10"
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">➕ Thêm hạn sử dụng lưu ý</h2>
                  <p className="text-[0.82rem] font-semibold text-slate-500 truncate max-w-[280px]">
                    {selectedProductForRecord.name}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedProductForRecord(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3.5">
                <InputGroup label="Hạn sử dụng (HSD) *">
                  <input 
                    type="date" 
                    className={inputClass} 
                    value={newRecordForm.expDate} 
                    onChange={e => handleNewRecordExpChange(e.target.value, newRecordForm.destroyDays)} 
                  />
                </InputGroup>

                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Hủy trước HSD (ngày)">
                    <input 
                      type="number" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      min="0"
                      className={inputClass} 
                      value={newRecordForm.destroyDays} 
                      onChange={e => handleNewRecordExpChange(newRecordForm.expDate, e.target.value)} 
                    />
                  </InputGroup>

                  <InputGroup label="Số lượng (cái/hộp)">
                    <input 
                      type="number" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      min="0" 
                      placeholder="VD: 10" 
                      className={inputClass} 
                      value={newRecordForm.quantity} 
                      onChange={e => setNewRecordForm({ ...newRecordForm, quantity: e.target.value })} 
                    />
                  </InputGroup>
                </div>

                {newRecordForm.expDate && (
                  <div className="p-3 bg-rose-50 border-0 shadow-apple-soft rounded-2xl flex justify-between items-center">
                    <span className="text-[0.82rem] font-semibold text-rose-800">Ngày phải hủy:</span>
                    <span className="font-mono font-bold text-rose-600 text-base">
                      {formatDate(newRecordForm.destructionDate)}
                    </span>
                  </div>
                )}

                <InputGroup label="Ghi chú lưu ý (Tùy chọn)">
                  <input 
                    type="text" 
                    placeholder="VD: Lô cận date kệ ngoài, cần dán tem vàng" 
                    className={inputClass} 
                    value={newRecordForm.note} 
                    onChange={e => setNewRecordForm({ ...newRecordForm, note: e.target.value })} 
                  />
                </InputGroup>

                <div className="flex gap-3 pt-3">
                  <button 
                    onClick={() => setSelectedProductForRecord(null)}
                    className="flex-1 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl active:scale-95 transition-all text-[0.95rem]"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleSaveRecord}
                    className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/30 active:scale-95 transition-all text-[0.95rem]"
                  >
                    Lưu hạn này
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const ExpiryScreen: React.FC<{ 
  onBack: () => void; 
  products: Product[];
  onUpdate?: (p: Product) => Promise<void>;
}> = ({ onBack, products, onUpdate }) => {
  const [expiryItems, setExpiryItems] = useState<EnrichedExpiryItem[]>([]);
  const [loadingExpiries, setLoadingExpiries] = useState<boolean>(true);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSavingNewRecord, setIsSavingNewRecord] = useState<boolean>(false);
  const [newRecordForm, setNewRecordForm] = useState({
    expDate: '',
    destroyDays: '15',
    destructionDate: ''
  });

  const {
    searchTerm: recordSearch,
    setSearchTerm: setRecordSearch,
    results: searchProductsResults,
    loading: loadingSearchProducts,
    isSearching: isSearchingProducts,
    clearSearch: clearProductSearch
  } = useProductSearch(250);

  useEffect(() => {
    setLoadingExpiries(true);
    const unsub = subscribeProductExpiries(products, (items) => {
      setExpiryItems(items);
      setLoadingExpiries(false);
    });
    return () => unsub();
  }, [products]);

  const expiryByBarcode = useMemo(() => {
    const map = new Map<string, EnrichedExpiryItem>();
    expiryItems.forEach(item => {
      map.set(item.barcode, item);
    });
    return map;
  }, [expiryItems]);

  const handleSelectProductForRecord = (p: Partial<Product> & { barcode: string; name: string }) => {
    const bc = (p.barcode || '').trim();
    const existingExp = expiryByBarcode.get(bc);
    const defaultDays = String(existingExp ? existingExp.destroy_days : (p.destroyDaysBeforeExpiry ?? 15));
    const defaultExpDate = existingExp ? existingExp.exp_date : '';
    const defaultDestruction = defaultExpDate
      ? calculateDestructionDate(defaultExpDate, parseInt(defaultDays) || 0)
      : '';

    setSelectedProduct({
      id: p.id || ('bc_' + bc),
      barcode: bc,
      name: p.name || `Sản phẩm (${bc})`,
      internalCode: p.internalCode,
      price: Number(p.price) || 0,
      destroyDaysBeforeExpiry: Number(defaultDays) || 0,
      destructionDate: defaultDestruction,
      expiryRecords: p.expiryRecords || []
    });
    setNewRecordForm({
      expDate: defaultExpDate,
      destroyDays: defaultDays,
      destructionDate: defaultDestruction
    });
    clearProductSearch();
  };

  const handleSaveNewRecord = async () => {
    if (!selectedProduct || !newRecordForm.expDate) {
      alert('Vui lòng chọn Hạn sử dụng (HSD)!');
      return;
    }

    const daysBefore = newRecordForm.destroyDays === '' || isNaN(parseInt(newRecordForm.destroyDays))
      ? 0
      : parseInt(newRecordForm.destroyDays);

    setIsSavingNewRecord(true);
    try {
      const updatedProduct = await saveProductExpiry(
        {
          barcode: selectedProduct.barcode,
          exp_date: newRecordForm.expDate,
          destroy_days: daysBefore
        },
        selectedProduct
      );
      invalidateBarcodeCache(selectedProduct.barcode);
      if (onUpdate) {
        await onUpdate(updatedProduct);
      }
      setSelectedProduct(null);
      clearProductSearch();
    } catch (err: any) {
      console.error('Error saving expiry record in ExpiryScreen:', err);
      alert('Lỗi khi lưu hạn sử dụng: ' + (err.message || 'Không thể lưu hạn sử dụng'));
    } finally {
      setIsSavingNewRecord(false);
    }
  };

  const handleDeleteRecord = async (item: EnrichedExpiryItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Xóa hạn sử dụng của "${item.product.name}"?`)) return;

    try {
      await deleteProductExpiry(item.barcode, item.product.id);
      invalidateBarcodeCache(item.barcode);
      if (onUpdate && item.product.id) {
        await onUpdate({
          ...item.product,
          destructionDate: '',
          expiryRecords: [],
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err: any) {
      console.error('Error deleting expiry record:', err);
      alert('Lỗi khi xóa hạn sử dụng: ' + (err.message || 'Lỗi'));
    }
  };

  const inputClass = "w-full max-w-full box-border block px-4 py-3.5 bg-slate-100/80 border-0 rounded-2xl text-[0.95rem] font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs";

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <Header 
        title="HẠN SỬ DỤNG" 
        onBack={onBack}
      />

      <div className="relative mb-5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Gõ tên, mã vạch, mã nội bộ để tìm & thêm HSD..."
              value={recordSearch}
              onChange={(e) => setRecordSearch(e.target.value)}
              className="w-full pl-11 pr-10 py-3.5 bg-white/95 backdrop-blur-md border-0 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-apple-soft transition-all"
            />
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            {loadingSearchProducts ? (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-600">
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : recordSearch ? (
              <button
                type="button"
                onClick={clearProductSearch}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors border-0 cursor-pointer"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setIsScannerModalOpen(true)}
            className="px-4 py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-2xl shadow-apple-soft flex items-center justify-center gap-2 text-xs sm:text-sm transition-all cursor-pointer border-0 shrink-0"
          >
            <Camera size={18} />
            <span>Quét mã</span>
          </button>
        </div>

        {isSearchingProducts && (
          <div className="mt-2 bg-white/98 backdrop-blur-xl rounded-3xl shadow-apple-lg border border-slate-100 overflow-hidden z-30 max-h-80 overflow-y-auto p-2 space-y-1.5">
            {loadingSearchProducts ? (
              <div className="text-center py-6 text-slate-400 text-xs flex items-center justify-center gap-2">
                <Loader2 className="animate-spin text-blue-600" size={16} />
                <span>Đang tìm trong danh mục hàng hóa...</span>
              </div>
            ) : searchProductsResults.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                Không tìm thấy sản phẩm nào khớp với "{recordSearch}"
              </div>
            ) : (
              searchProductsResults.map(p => {
                const tracked = expiryByBarcode.get((p.barcode || '').trim());
                return (
                  <div
                    key={p.id || p.barcode}
                    onClick={() => handleSelectProductForRecord(p)}
                    className="p-3 bg-slate-50/80 hover:bg-blue-50/90 rounded-2xl cursor-pointer transition-all flex justify-between items-center gap-2 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-xs sm:text-sm truncate group-hover:text-blue-600 transition-colors">
                        {p.name}
                      </div>
                      <div className="text-[0.72rem] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{p.barcode}</span>
                        {p.internalCode && (
                          <span className="bg-slate-200/80 text-slate-700 px-1.5 py-0.2 rounded font-semibold text-[0.65rem]">
                            #{p.internalCode}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {tracked ? (
                        <span className="text-[0.68rem] font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                          HSD: {formatDate(tracked.exp_date)}
                        </span>
                      ) : (
                        <span className="text-[0.68rem] font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Plus size={12} /> Thêm HSD
                        </span>
                      )}
                      <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="pb-28 space-y-3.5">
        {loadingExpiries && expiryItems.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin text-blue-600" />
            <span>Đang đồng bộ dữ liệu hạn sử dụng...</span>
          </div>
        ) : expiryItems.length === 0 ? (
          <EmptyState icon={<Clock size={48} />} message="Chưa có sản phẩm nào được lưu hạn sử dụng" />
        ) : (
          expiryItems.map((item) => {
            const { product, status } = item;
            return (
              <motion.div 
                key={item.barcode}
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                onClick={() => handleSelectProductForRecord(product)}
                className={`p-4 sm:p-5 rounded-[1.5rem] bg-gradient-to-br ${status.cls} text-white shadow-lg relative overflow-hidden cursor-pointer active:scale-[0.99] transition-all`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs sm:text-sm font-extrabold tracking-wide mb-1 flex items-center gap-1.5 flex-wrap">
                      <span className="truncate">{product.name}</span>
                      <span className="opacity-85 font-mono text-[0.72rem]">({item.barcode})</span>
                      {product.internalCode && (
                        <span className="bg-white/20 px-1.5 py-0.2 rounded text-[0.68rem] font-mono">#{product.internalCode}</span>
                      )}
                    </div>
                    <div className="text-xl sm:text-2xl font-black mb-1 font-mono">
                      Hủy: {formatDate(item.destructionDate)}
                    </div>
                    <div className="text-[0.82rem] font-medium opacity-95 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>HSD: {formatDate(item.exp_date)}</span>
                      <span>•</span>
                      <span>Hủy trước: {item.destroy_days} ngày</span>
                      <span>•</span>
                      <span className="font-bold underline decoration-white/40">{status.txt}</span>
                    </div>
                  </div>

                  <button 
                    type="button"
                    onClick={(e) => handleDeleteRecord(item, e)}
                    className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-all active:scale-95 text-white shrink-0 cursor-pointer border-0"
                    title="Xóa hạn sử dụng này"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => setSelectedProduct(null)}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white/95 backdrop-blur-md rounded-t-[2.5rem] sm:rounded-3xl p-6 sm:p-8 max-h-[90vh] flex flex-col shadow-apple-lg border-0 z-10"
            >
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="text-blue-600" size={22} /> Lưu Hạn Sử Dụng
                </h2>
                <button 
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors border-0 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-blue-50/80 rounded-2xl flex justify-between items-center border-0 shadow-apple-soft">
                  <div className="min-w-0 pr-2">
                    <div className="text-[0.7rem] text-blue-700 font-bold uppercase tracking-wider mb-0.5">Sản phẩm từ kho</div>
                    <div className="font-bold text-slate-900 text-sm sm:text-base truncate">{selectedProduct.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                      <span>{selectedProduct.barcode}</span>
                      {selectedProduct.internalCode && (
                        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-semibold text-[0.68rem]">
                          #{selectedProduct.internalCode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Hạn sử dụng (HSD) *">
                    <input 
                      type="date" 
                      className={inputClass} 
                      value={newRecordForm.expDate} 
                      onChange={e => {
                        const val = e.target.value;
                        const days = newRecordForm.destroyDays === '' || isNaN(parseInt(newRecordForm.destroyDays)) ? 0 : parseInt(newRecordForm.destroyDays);
                        const calc = calculateDestructionDate(val, days);
                        setNewRecordForm({ ...newRecordForm, expDate: val, destructionDate: calc });
                      }} 
                    />
                  </InputGroup>
                  
                  <InputGroup label="Số ngày hủy trước">
                    <input 
                      type="number" 
                      inputMode="numeric" 
                      min="0"
                      placeholder="VD: 15" 
                      className={inputClass} 
                      value={newRecordForm.destroyDays} 
                      onChange={e => {
                        const daysStr = e.target.value;
                        const days = daysStr === '' || isNaN(parseInt(daysStr)) ? 0 : parseInt(daysStr);
                        const calc = calculateDestructionDate(newRecordForm.expDate, days);
                        setNewRecordForm({ ...newRecordForm, destroyDays: daysStr, destructionDate: calc });
                      }} 
                    />
                  </InputGroup>
                </div>

                {newRecordForm.destructionDate && (
                  <div className="p-3.5 bg-rose-50/90 rounded-2xl text-xs font-semibold text-rose-800 flex items-center justify-between border-0 shadow-apple-soft">
                    <span>Ngày phải hủy:</span>
                    <span className="font-mono font-bold text-rose-600 text-sm">
                      {formatDate(newRecordForm.destructionDate)}
                    </span>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setSelectedProduct(null)} 
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-full transition-all border-0 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveNewRecord}
                    disabled={isSavingNewRecord}
                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-full shadow-apple-soft transition-all border-0 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSavingNewRecord ? 'Đang lưu...' : 'Lưu hạn sử dụng'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BarcodeScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        onProductFound={(prod) => {
          setIsScannerModalOpen(false);
          handleSelectProductForRecord(prod);
        }}
      />
    </motion.div>
  );
};

export const PriceScreen: React.FC<{ 
  onBack: () => void; 
  products: Product[];
  onOpenScanner?: () => void;
}> = ({ onBack, products, onOpenScanner }) => {
  const [search, setSearch] = useState('');
  
  const searchLower = search.trim().toLowerCase();
  
  const filteredProducts = useMemo(() => {
    if (!searchLower) return products;
    return products.filter(p => {
      if (p.name.toLowerCase().includes(searchLower)) return true;
      if (p.barcode.toLowerCase().includes(searchLower)) return true;
      if (p.internalCode && p.internalCode.toLowerCase().includes(searchLower)) return true;
      
      // If it's a numeric search, also try matching the end of the barcode
      if (/^\d+$/.test(searchLower) && p.barcode.endsWith(searchLower)) return true;

      return false;
    });
  }, [products, searchLower]);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <Header title="CHECK GIÁ" onBack={onBack} />
      <div className="mb-6 flex gap-2">
        <div className="relative flex-1 shadow-sm rounded-[1.2rem] overflow-hidden bg-white border-0 shadow-apple-soft focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            className="w-full pl-12 pr-12 py-4 bg-transparent outline-none text-[0.95rem] font-medium text-slate-700"
            placeholder="Nhập mã vạch, mã nội bộ, tên..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 bg-slate-200 text-slate-500 rounded-full hover:bg-slate-300 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {onOpenScanner && (
          <button
            type="button"
            onClick={onOpenScanner}
            className="px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-[1.2rem] shadow-sm flex items-center justify-center gap-1.5 font-bold text-xs transition-all cursor-pointer shrink-0"
            title="Quét mã vạch hoặc tem giá"
          >
            <Camera size={18} />
            <span className="hidden sm:inline">Quét camera</span>
          </button>
        )}
      </div>
      <div className="pb-24 space-y-3">
        {filteredProducts.length === 0 ? (
          <EmptyState icon={<Search size={48} />} message={search ? "Không tìm thấy sản phẩm" : "Chưa có sản phẩm nào"} />
        ) : (
          filteredProducts.map(p => (
            <div key={p.id} className="bg-white/90 backdrop-blur-md rounded-3xl p-4 flex justify-between items-center shadow-apple border-0">
              <div>
                <h3 className="font-bold text-slate-800 text-[0.95rem]">{p.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-[0.75rem] text-slate-500">{p.barcode}</span>
                  {p.internalCode && (
                    <span className="text-[0.75rem] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md font-mono">
                      #{p.internalCode}
                    </span>
                  )}
                </div>
              </div>
              <div className="font-bold text-blue-600 text-[1rem]">
                {(p.price || 0).toLocaleString('vi-VN')}đ
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};

export const DataScreen: React.FC<{ 
  onBack: () => void; 
  products: Product[]; 
  onImport?: (data: string) => void;
  currentUser?: { username: string; name: string; role: 'admin' | 'user' } | null;
}> = ({ onBack, products, currentUser }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    if (!currentUser || currentUser.role === 'admin') return true;
    return sessionStorage.getItem('data_access_unlocked') === '1203';
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [activeTab, setActiveTab] = useState<'sell' | 'order'>('sell');
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [importState, setImportState] = useState<{ done: number; total: number; title: string } | null>(null);
  
  const [totalProductsCount, setTotalProductsCount] = useState<number | null>(() => {
    const c = localStorage.getItem('cached_products_count');
    return c ? Number(c) : null;
  });
  const [totalProductsPrice, setTotalProductsPrice] = useState<number | null>(() => {
    const p = localStorage.getItem('cached_products_price');
    return p ? Number(p) : null;
  });

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
        if (!error && typeof count === 'number' && active) {
          setTotalProductsCount(count);
          localStorage.setItem('cached_products_count', String(count));
        }
        const { data: priceData } = await supabase.from('products').select('price').limit(10000);
        if (priceData && active) {
          const sp = priceData.reduce((acc: number, row: any) => acc + (Number(row.price) || 0), 0);
          setTotalProductsPrice(sp);
          localStorage.setItem('cached_products_price', String(sp));
        }
      } catch (e) {
        console.warn('Stats fetch note:', e);
      }
    };
    fetchStats();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const unsubConsumables = subscribeConsumables((items) => {
      setConsumables(items);
    });
    return () => {
      unsubConsumables();
    };
  }, []);

  const totalValue = products.reduce((sum, p) => sum + (p.price || 0), 0);
  
  let totalRecords = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;

  products.forEach(p => {
    const records = getProductRecords(p);
    totalRecords += records.length;
    records.forEach(rec => {
      const st = getStatus(rec.destructionDate);
      if (st.isExpired) expiredCount++;
      else if (st.isNear) nearExpiryCount++;
    });
  });

  const handleExportSell = () => {
    let csv = 'Tên,Barcode,Mã nội bộ,Hủy trước HSD (ngày),HSD,Ngày hủy,Giá,SL,Ghi chú\n';
    products.forEach(p => {
      const records = getProductRecords(p);
      if (records.length === 0) {
        csv += `"${p.name}","${p.barcode}","${p.internalCode || ''}",${p.destroyDaysBeforeExpiry || 0},"","${p.destructionDate || ''}",${p.price || 0},,""\n`;
      } else {
        records.forEach(r => {
          csv += `"${p.name}","${p.barcode}","${p.internalCode || ''}",${p.destroyDaysBeforeExpiry || 0},"${r.expDate}","${r.destructionDate}",${p.price || 0},${r.quantity || ''},"${r.note || ''}"\n`;
        });
      }
    });
    downloadCSV(csv, 'item_ban');
  };

  const handleExportOrder = () => {
    let csv = 'Mã hàng (SKU),Tên hàng,Chính sách / Nhà cung cấp\n';
    consumables.forEach(c => {
      csv += `"${c.sku}","${c.name}","${c.supplier || ''}"\n`;
    });
    downloadCSV(csv, 'item_dat_hang');
  };

  const downloadCSV = (csv: string, prefix: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${prefix}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const extractProductItems = (rawData: any[][]): Omit<Product, 'id'>[] => {
    if (rawData.length <= 1) return [];

    let headerRowIndex = -1;
    let headers: string[] = [];
    for (let r = 0; r < Math.min(10, rawData.length); r++) {
      const row = rawData[r];
      if (Array.isArray(row)) {
        const rowStr = row.map(cell => String(cell || '').trim().toLowerCase()).join(' ');
        if (rowStr.includes('barcode') || rowStr.includes('mã vạch') || rowStr.includes('tên') || rowStr.includes('giá') || rowStr.includes('hsd') || rowStr.includes('nội bộ')) {
          headerRowIndex = r;
          headers = row.map(cell => String(cell || '').trim().toLowerCase());
          break;
        }
      }
    }

    const findColIdx = (keywords: string[]) => {
      return headers.findIndex(h => keywords.some(k => h.includes(k)));
    };

    const nameIdx = headerRowIndex >= 0 ? findColIdx(['tên', 'ten', 'sản phẩm', 'san pham', 'mặt hàng', 'name']) : 0;
    const barcodeIdx = headerRowIndex >= 0 ? findColIdx(['barcode', 'mã vạch', 'ma vach']) : 1;
    const internalCodeIdx = headerRowIndex >= 0 ? findColIdx(['nội bộ', 'noi bo', 'mã nb', 'mã sp', 'sku', 'code', 'mã hàng']) : 2;
    const destroyDaysIdx = headerRowIndex >= 0 ? findColIdx(['hủy trước', 'huy truoc', 'ngày trước', 'destroy']) : 3;
    const expDateIdx = headerRowIndex >= 0 ? findColIdx(['hsd', 'hạn dùng', 'han dung', 'hạn sử dụng', 'exp']) : 4;
    const destructionDateIdx = headerRowIndex >= 0 ? findColIdx(['ngày hủy', 'ngay huy']) : 5;
    const priceIdx = headerRowIndex >= 0 ? findColIdx(['giá', 'gia', 'đơn giá', 'don gia', 'price']) : 6;
    const qtyIdx = headerRowIndex >= 0 ? findColIdx(['số lượng', 'so luong', 'sl', 'qty']) : 7;
    const noteIdx = headerRowIndex >= 0 ? findColIdx(['ghi chú', 'ghi chu', 'note']) : 8;

    const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 1;
    const items: Omit<Product, 'id'>[] = [];

    for (let i = startRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (!Array.isArray(row) || row.every(c => c === '' || c === undefined || c === null)) continue;

      let nameVal = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
      let barcodeVal = barcodeIdx >= 0 ? String(row[barcodeIdx] || '').trim() : '';
      let internalCodeVal = internalCodeIdx >= 0 ? String(row[internalCodeIdx] || '').trim() : '';
      let destroyDaysVal = destroyDaysIdx >= 0 ? parseInt(String(row[destroyDaysIdx]).replace(/\D/g, ''), 10) : 0;
      let expDateVal = expDateIdx >= 0 ? String(row[expDateIdx] || '').trim() : '';
      let destructionDateVal = destructionDateIdx >= 0 ? String(row[destructionDateIdx] || '').trim() : '';
      let priceVal = priceIdx >= 0 ? parseInt(String(row[priceIdx]).replace(/\D/g, ''), 10) : 0;
      let qtyVal = qtyIdx >= 0 ? parseInt(String(row[qtyIdx]).replace(/\D/g, ''), 10) : undefined;
      let noteVal = noteIdx >= 0 ? String(row[noteIdx] || '').trim() : undefined;

      if (!barcodeVal && internalCodeVal) {
        barcodeVal = internalCodeVal;
      }
      if (!internalCodeVal && barcodeVal) {
        internalCodeVal = barcodeVal;
      }

      if (nameVal || barcodeVal) {
        if (!nameVal) nameVal = 'Mặt hàng ' + (barcodeVal || internalCodeVal || i);
        if (!barcodeVal) barcodeVal = 'SP' + (internalCodeVal || i);

        const records: ExpiryRecord[] = [];
        const hasValidExp = isValidRealExpiryDate(expDateVal);
        const hasValidDestruction = isValidRealExpiryDate(destructionDateVal);

        if (hasValidExp || hasValidDestruction) {
          const dDate = hasValidDestruction 
            ? destructionDateVal 
            : (hasValidExp ? calculateDestructionDate(expDateVal, isNaN(destroyDaysVal) ? 0 : destroyDaysVal) : '');
          if (isValidRealExpiryDate(dDate)) {
            records.push({
              id: 'rec-' + Date.now() + '-' + i,
              expDate: expDateVal || dDate,
              destructionDate: dDate,
              quantity: isNaN(Number(qtyVal)) ? undefined : qtyVal,
              note: noteVal,
              createdAt: new Date().toISOString()
            });
          }
        }

        const validEarliestDestruction = records.length > 0 ? records[0].destructionDate : '';

        items.push({
          name: nameVal,
          barcode: barcodeVal,
          internalCode: internalCodeVal || undefined,
          destroyDaysBeforeExpiry: isNaN(destroyDaysVal) ? 0 : destroyDaysVal,
          price: isNaN(priceVal) ? 0 : priceVal,
          destructionDate: validEarliestDestruction,
          expiryRecords: records
        });
      }
    }

    return items;
  };

  const handleImportSell = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fileNameLower = file.name.toLowerCase();
      let gridData: any[][] = [];
      if (fileNameLower.endsWith('.csv') || fileNameLower.endsWith('.txt')) {
        const text = await file.text();
        gridData = parseCSVRows(text);
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        gridData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      }

      const items = extractProductItems(gridData);
      if (items.length === 0) {
        alert('File không có dữ liệu hợp lệ!');
        return;
      }

      setImportState({ done: 0, total: items.length, title: 'Đang nạp Item Bán...' });
      const count = await addProductsBulk(items, 'shared', (done, total) => {
        setImportState({ done, total, title: 'Đang nạp Item Bán...' });
      });

      const addedPrice = items.reduce((acc, it) => acc + (it.price || 0), 0);
      setTotalProductsCount(count);
      localStorage.setItem('cached_products_count', String(count));
      setTotalProductsPrice(addedPrice);
      localStorage.setItem('cached_products_price', String(addedPrice));

      alert(`Đã import thành công ${count} Item Bán!`);

      try {
        const { count: serverCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
        if (typeof serverCount === 'number') {
          setTotalProductsCount(serverCount);
          localStorage.setItem('cached_products_count', String(serverCount));
        }
        const { data: priceData } = await supabase.from('products').select('price').limit(10000);
        if (priceData) {
          const serverPrice = priceData.reduce((acc: number, row: any) => acc + (Number(row.price) || 0), 0);
          setTotalProductsPrice(serverPrice);
          localStorage.setItem('cached_products_price', String(serverPrice));
        }
      } catch (err) {
        console.warn('Update stats note:', err);
      }
    } catch (err: any) {
      console.error(err);
      alert('Có lỗi khi import: ' + (err?.message || 'Thất bại'));
    } finally {
      setImportState(null);
      e.target.value = '';
    }
  };

  const handleImportOrder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fileNameLower = file.name.toLowerCase();
      let gridData: any[][] = [];
      if (fileNameLower.endsWith('.csv') || fileNameLower.endsWith('.txt')) {
        const text = await file.text();
        gridData = parseCSVRows(text);
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        gridData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      }

      let headerRowIndex = -1;
      let headers: string[] = [];
      for (let r = 0; r < Math.min(10, gridData.length); r++) {
        const row = gridData[r];
        if (Array.isArray(row)) {
          const rowStr = row.map(cell => String(cell || '').trim().toLowerCase()).join(' ');
          if (rowStr.includes('sku') || rowStr.includes('mã') || rowStr.includes('tên') || rowStr.includes('nhà cung cấp') || rowStr.includes('supplier')) {
            headerRowIndex = r;
            headers = row.map(cell => String(cell || '').trim().toLowerCase());
            break;
          }
        }
      }

      const findCol = (kw: string[]) => headers.findIndex(h => kw.some(k => h.includes(k)));
      const skuIdx = headerRowIndex >= 0 ? findCol(['sku', 'mã', 'ma']) : 0;
      const nameIdx = headerRowIndex >= 0 ? findCol(['tên', 'ten', 'sản phẩm', 'san pham', 'hàng']) : 1;
      const supIdx = headerRowIndex >= 0 ? findCol(['cung cấp', 'cung cap', 'supplier', 'chính sách']) : 2;

      const start = headerRowIndex >= 0 ? headerRowIndex + 1 : 1;
      const items: Omit<ConsumableItem, 'id'>[] = [];
      for (let i = start; i < gridData.length; i++) {
        const parts = gridData[i];
        if (!Array.isArray(parts)) continue;
        const s = skuIdx >= 0 ? String(parts[skuIdx] || '').trim() : '';
        const n = nameIdx >= 0 ? String(parts[nameIdx] || '').trim() : '';
        const sup = supIdx >= 0 ? String(parts[supIdx] || '').trim() : undefined;
        if (s || n) {
          items.push({
            sku: s || ('SKU' + i),
            name: n || ('Vật tư ' + (s || i)),
            supplier: sup || undefined
          });
        }
      }

      if (items.length === 0) {
        alert('File không có dữ liệu hợp lệ!');
        return;
      }
      setImportState({ done: 0, total: items.length, title: 'Đang nạp Item Đặt Hàng...' });
      const count = await addConsumablesBulk(items, (done, total) => {
        setImportState({ done, total, title: 'Đang nạp Item Đặt Hàng...' });
      });
      alert(`Đã import thành công ${count} Item Đặt Hàng!`);
    } catch (err: any) {
      console.error(err);
      alert('Có lỗi khi import: ' + (err?.message || 'Thất bại'));
    } finally {
      setImportState(null);
      e.target.value = '';
    }
  };

  // Hàm phân tích file CSV (hỗ trợ phân cách bằng phẩy hoặc chấm phẩy, hỗ trợ dấu ngoặc kép và tiếng Việt UTF-8)
  const parseCSVRows = (text: string): string[][] => {
    const cleanText = text.replace(/^\uFEFF/, ''); // xóa UTF-8 BOM nếu có
    const lines: string[][] = [];
    let row: string[] = [];
    let current = '';
    let inQuotes = false;

    // Tự động nhận diện dấu phân cách từ dòng đầu tiên
    const firstLine = cleanText.split(/\r\n|\n|\r/)[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const delimiter = semicolonCount > commaCount && semicolonCount > tabCount ? ';' : (tabCount > commaCount ? '\t' : ',');

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(current.trim());
        if (row.some(c => c !== '')) {
          lines.push(row);
        }
        row = [];
        current = '';
      } else {
        current += char;
      }
    }

    if (current !== '' || row.length > 0) {
      row.push(current.trim());
      if (row.some(c => c !== '')) {
        lines.push(row);
      }
    }

    return lines;
  };

  const handleClearSell = async () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ CSDL Item Bán không?')) {
      await clearProductsCollection();
    }
  };

  const handleClearOrder = async () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ CSDL Item Đặt Hàng không?')) {
      await clearConsumablesCollection();
    }
  };

  if (!isUnlocked) {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
        <Header title="DỮ LIỆU HÀNG" onBack={onBack} />
        <div className="max-w-md mx-auto bg-white/95 backdrop-blur-md rounded-3xl p-8 shadow-apple-lg border-0 text-center space-y-5 mt-8">
          <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border-0">
            <Lock size={26} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Khóa Quản Trị</h3>
            <p className="text-xs text-slate-500 mt-1">Vui lòng nhập mã PIN quản trị viên để tiếp tục.</p>
          </div>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (pinInput.trim() === '1203') {
              sessionStorage.setItem('data_access_unlocked', '1203');
              setIsUnlocked(true);
            } else {
              setPinError('Mật khẩu không đúng!');
            }
          }} className="space-y-4">
            <input
              type="password"
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                if (pinError) setPinError('');
              }}
              placeholder="••••••••"
              className="w-full px-5 py-4 bg-slate-100/80 border-0 rounded-2xl text-center text-xl font-mono tracking-widest text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 shadow-2xs"
            />
            {pinError && <p className="text-rose-500 text-xs font-semibold">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full text-sm shadow-apple-soft transition-all active:scale-95 cursor-pointer border-0"
            >
              Mở khóa
            </button>
          </form>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <Header title="DỮ LIỆU HÀNG" onBack={onBack} />
      
      {/* Segmented Control phong cách Apple Pill Bar */}
      <div className="flex bg-white/95 backdrop-blur-md p-1.5 rounded-full shadow-apple-soft mb-6 border-0 gap-1.5">
        <button 
          onClick={() => setActiveTab('sell')}
          className={`flex-1 py-2.5 px-3 rounded-full font-semibold text-xs transition-all border-0 text-center truncate cursor-pointer ${
            activeTab === 'sell' 
              ? 'bg-blue-600 text-white shadow-apple-soft' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Item Bán Hàng
        </button>
        <button 
          onClick={() => setActiveTab('order')}
          className={`flex-1 py-2.5 px-3 rounded-full font-semibold text-xs transition-all border-0 text-center truncate cursor-pointer ${
            activeTab === 'order' 
              ? 'bg-blue-600 text-white shadow-apple-soft' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Item Đặt Hàng
        </button>
      </div>

      {importState && (
        <div className="mb-5 p-5 bg-white/95 backdrop-blur-md rounded-3xl shadow-apple border-0 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
            <div className="flex items-center gap-2 text-blue-600">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping shrink-0" />
              <span>{importState.title}</span>
            </div>
            <span className="font-mono text-blue-600 text-sm font-extrabold">
              {importState.total > 0 ? Math.min(100, Math.round((importState.done / importState.total) * 100)) : 0}%
            </span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border-0">
            <div 
              className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-200 shadow-2xs"
              style={{ width: `${importState.total > 0 ? Math.min(100, Math.round((importState.done / importState.total) * 100)) : 0}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[0.72rem] text-slate-500 font-medium">
            <span>Đã nạp: <strong className="text-slate-800 font-mono">{importState.done.toLocaleString('vi-VN')}</strong> / {importState.total.toLocaleString('vi-VN')}</span>
            <span className="text-blue-500 font-semibold">Vui lòng chờ...</span>
          </div>
        </div>
      )}

      {activeTab === 'sell' && (
        <div className="animate-in fade-in zoom-in-95 duration-200">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button onClick={handleExportSell} className="py-5 px-4 bg-white/95 backdrop-blur-md text-slate-800 font-semibold rounded-3xl shadow-apple-soft hover:shadow-apple flex flex-col items-center justify-center gap-2.5 active:scale-95 transition-all cursor-pointer border-0">
              <div className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Upload size={22} />
              </div>
              <span className="text-sm">Xuất file CSV</span>
            </button>
            <label className={`py-5 px-4 bg-white/95 backdrop-blur-md text-slate-800 font-semibold rounded-3xl shadow-apple-soft hover:shadow-apple flex flex-col items-center justify-center gap-2.5 transition-all border-0 ${importState ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 cursor-pointer'}`}>
              <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Download size={22} />
              </div>
              <span className="text-sm">Nhập file CSV</span>
              <input type="file" accept=".csv, .xlsx, .xls, .txt" className="hidden" onChange={handleImportSell} disabled={Boolean(importState)} />
            </label>
            <button onClick={handleClearSell} className="col-span-2 py-3.5 bg-rose-50 text-rose-700 font-semibold rounded-full shadow-apple-soft flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-rose-100 cursor-pointer text-xs border-0">
              <Trash size={16} /> Xóa CSDL Item Bán
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-24">
            <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl shadow-apple-soft border-0 text-center">
              <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-2">Tổng sản phẩm</div>
              <div className="text-3xl font-bold text-slate-900">{(totalProductsCount !== null ? totalProductsCount : products.length).toLocaleString('vi-VN')}</div>
            </div>
            <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl shadow-apple-soft border-0 text-center">
              <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-2">Tổng record hạn</div>
              <div className="text-3xl font-bold text-blue-600">{totalRecords.toLocaleString('vi-VN')}</div>
            </div>
            <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl shadow-apple-soft border-0 text-center col-span-2">
              <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1">Tổng giá trị hàng</div>
              <div className="text-2xl font-bold text-emerald-600">{(totalProductsPrice !== null ? totalProductsPrice : totalValue).toLocaleString('vi-VN')}đ</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'order' && (
        <div className="animate-in fade-in zoom-in-95 duration-200">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button onClick={handleExportOrder} className="py-5 px-4 bg-white/95 backdrop-blur-md text-slate-800 font-semibold rounded-3xl shadow-apple-soft hover:shadow-apple flex flex-col items-center justify-center gap-2.5 active:scale-95 transition-all cursor-pointer border-0">
              <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Upload size={22} />
              </div>
              <span className="text-sm">Xuất file CSV</span>
            </button>
            <label className={`py-5 px-4 bg-white/95 backdrop-blur-md text-slate-800 font-semibold rounded-3xl shadow-apple-soft hover:shadow-apple flex flex-col items-center justify-center gap-2.5 transition-all border-0 ${importState ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 cursor-pointer'}`}>
              <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Download size={22} />
              </div>
              <span className="text-sm">Nhập file CSV</span>
              <input type="file" accept=".csv, .xlsx, .xls, .txt" className="hidden" onChange={handleImportOrder} disabled={Boolean(importState)} />
            </label>
            <button onClick={handleClearOrder} className="col-span-2 py-3.5 bg-rose-50 text-rose-700 font-semibold rounded-full shadow-apple-soft flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-rose-100 cursor-pointer text-xs border-0">
              <Trash size={16} /> Xóa CSDL Item Đặt Hàng
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-24">
            <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl shadow-apple-soft border-0 text-center col-span-2">
              <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-2">Tổng mặt hàng đặt</div>
              <div className="text-3xl font-bold text-blue-600">{consumables.length.toLocaleString('vi-VN')}</div>
            </div>
          </div>
        </div>
      )}

    </motion.div>
  );
};

