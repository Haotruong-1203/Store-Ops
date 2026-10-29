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
  HelpCircle
} from 'lucide-react';
import { Header, Card, EmptyState, InputGroup } from '../components/SharedUI';
import { Product, ExpiryRecord, clearProductsCollection, addProductOnline } from '../lib/firestoreService';
import { subscribeConsumables, addConsumableOnline, clearConsumablesCollection, ConsumableItem } from '../lib/consumableService';
import { 
  subscribeDestructionItems, 
  saveDestructionBatchOnline, 
  clearDestructionCollection, 
  DestructionItem, 
  INITIAL_SAMPLE_DESTRUCTION_ITEMS 
} from '../lib/destructionService';
import { 
  formatDate, 
  getStatus, 
  calculateDestructionDate, 
  getProductRecords, 
  getEarliestDestructionDate 
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

  const inputClass = "w-full max-w-full box-border block p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[0.95rem] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <Header title="KIỂM HÀNG" onBack={onBack} />
      
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
            className="w-full py-4 pl-12 pr-28 bg-white border border-slate-200/80 rounded-2xl shadow-sm text-[0.95rem] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
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
              className={`text-[0.72rem] font-bold px-2 py-1 rounded-xl border transition-all flex items-center gap-1 ${searchKeyboardMode === 'numeric' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-100 border-slate-200 text-slate-600'}`}
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
                className="bg-white border border-slate-100 rounded-[1.5rem] p-5 shadow-sm hover:shadow-md transition-shadow"
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
                        <span className="inline-flex items-center gap-1 text-[0.75rem] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
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
                    className="text-[0.75rem] font-bold text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95 border border-slate-200"
                  >
                    Sửa
                  </button>
                  <button 
                    onClick={() => handleDeleteProduct(product)}
                    className="text-[0.75rem] font-bold text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95 border border-rose-100"
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
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
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
                      <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-xl text-[0.82rem] flex justify-between items-center">
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
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex justify-between items-center">
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
  const [filterMode, setFilterMode] = useState<'all' | 'warning' | 'expired'>('all');

  // Flatten all expiry records across all products
  const allRecords = useMemo(() => {
    const list: Array<{
      product: Product;
      record: ExpiryRecord;
      status: ReturnType<typeof getStatus>;
    }> = [];

    products.forEach(p => {
      const records = getProductRecords(p);
      records.forEach(rec => {
        const st = getStatus(rec.destructionDate);
        list.push({
          product: p,
          record: rec,
          status: st
        });
      });
    });

    // Sort by earliest destruction date
    return list.sort((a, b) => new Date(a.record.destructionDate).getTime() - new Date(b.record.destructionDate).getTime());
  }, [products]);

  const [isAddRecordModalOpen, setIsAddRecordModalOpen] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newRecordForm, setNewRecordForm] = useState({
    expDate: '',
    destroyDays: '0',
    destructionDate: '',
    quantity: '',
    note: ''
  });

  const searchLower = recordSearch.trim().toLowerCase();
  const filteredProductsForRecord = useMemo(() => {
    if (!searchLower) return [];
    return products.filter(p => 
      p.name.toLowerCase().includes(searchLower) || 
      p.barcode.toLowerCase().includes(searchLower) ||
      (p.internalCode && p.internalCode.toLowerCase().includes(searchLower))
    );
  }, [products, searchLower]);

  const handleOpenAddRecordModal = () => {
    setIsAddRecordModalOpen(true);
    setRecordSearch('');
    setSelectedProduct(null);
  };

  const handleSelectProductForRecord = (p: Product) => {
    setSelectedProduct(p);
    setNewRecordForm({
      expDate: '',
      destroyDays: String(p.destroyDaysBeforeExpiry ?? 0),
      destructionDate: '',
      quantity: '',
      note: ''
    });
  };

  const handleSaveNewRecord = async () => {
    if (!selectedProduct || !newRecordForm.expDate) {
      alert('Vui lòng chọn sản phẩm và nhập HSD!');
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
    
    const currentRecords = getProductRecords(selectedProduct);
    const updatedRecords = [...currentRecords, newRecord].sort(
      (a, b) => new Date(a.destructionDate).getTime() - new Date(b.destructionDate).getTime()
    );
    
    if (onUpdate) {
      await onUpdate({
        ...selectedProduct,
        destructionDate: updatedRecords[0].destructionDate,
        expiryRecords: updatedRecords
      });
    }
    
    setIsAddRecordModalOpen(false);
  };

  const filteredRecords = useMemo(() => {
    if (filterMode === 'expired') {
      return allRecords.filter(item => item.status.isExpired);
    }
    if (filterMode === 'warning') {
      return allRecords.filter(item => item.status.isNear || item.status.isExpired);
    }
    return allRecords;
  }, [allRecords, filterMode]);

  const expiredCount = allRecords.filter(r => r.status.isExpired).length;
  const warningCount = allRecords.filter(r => r.status.isNear).length;

  const handleDeleteRecord = async (product: Product, recordId: string) => {
    const currentRecords = getProductRecords(product);
    const updated = currentRecords.filter(r => r.id !== recordId);
    
    if (onUpdate) {
      await onUpdate({
        ...product,
        destructionDate: updated.length > 0 ? updated[0].destructionDate : '',
        expiryRecords: updated
      });
    }
  };

  const inputClass = "w-full max-w-full box-border block p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[0.95rem] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <Header title="KIỂM HSD" onBack={onBack} />

      <div className="flex justify-end mb-4">
        <button 
          onClick={handleOpenAddRecordModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
        >
          <Plus size={18} /> Thêm hạn sử dụng mới
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        <button 
          onClick={() => setFilterMode('all')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-[0.8rem] font-bold transition-all ${filterMode === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
        >
          Tất cả ({allRecords.length})
        </button>
        <button 
          onClick={() => setFilterMode('warning')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-[0.8rem] font-bold transition-all ${filterMode === 'warning' ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-amber-700 hover:bg-amber-50'}`}
        >
          Cần lưu ý ({warningCount})
        </button>
        <button 
          onClick={() => setFilterMode('expired')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-[0.8rem] font-bold transition-all ${filterMode === 'expired' ? 'bg-rose-500 text-white shadow-sm' : 'bg-white text-rose-700 hover:bg-rose-50'}`}
        >
          Quá date ({expiredCount})
        </button>
      </div>

      {/* Records List */}
      <div className="pb-28 space-y-3">
        {filteredRecords.length === 0 ? (
          <EmptyState icon={<Clock size={48} />} message="Không có record nào trong mục này" />
        ) : (
          filteredRecords.map(({ product, record, status }) => (
            <motion.div 
              key={record.id}
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className={`p-4 sm:p-5 rounded-[1.5rem] bg-gradient-to-br ${status.cls} text-white shadow-lg relative overflow-hidden`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  <div className="text-[0.72rem] uppercase font-bold tracking-wider opacity-90 mb-1 flex items-center gap-1.5 flex-wrap">
                    <span>{product.name}</span>
                    <span className="opacity-75 font-mono">({product.barcode})</span>
                    {product.internalCode && (
                      <span className="bg-white/20 px-1.5 py-0.2 rounded text-[0.68rem]">#{product.internalCode}</span>
                    )}
                  </div>
                  <div className="text-xl sm:text-2xl font-black mb-1 font-mono">
                    Hủy: {formatDate(record.destructionDate)}
                  </div>
                  <div className="text-[0.82rem] font-medium opacity-95">
                    HSD gốc: {formatDate(record.expDate)} • {status.txt}
                  </div>
                  {(record.quantity || record.note) && (
                    <div className="mt-2 text-[0.75rem] bg-black/15 p-2 rounded-lg inline-block">
                      {record.quantity && <span className="font-bold mr-2">SL: {record.quantity}</span>}
                      {record.note && <span>"{record.note}"</span>}
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => handleDeleteRecord(product, record.id)}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-all active:scale-95 text-white"
                  title="Xóa / Đã hủy lô này"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isAddRecordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsAddRecordModalOpen(false)}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 max-h-[90vh] flex flex-col shadow-2xl z-10"
            >
              <div className="flex justify-between items-center mb-5 shrink-0">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Plus className="text-blue-600" size={24} /> Thêm HSD Mới
                </h2>
                <button 
                  onClick={() => setIsAddRecordModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pb-2">
                {!selectedProduct ? (
                  <>
                    <InputGroup label="Tìm Sản Phẩm *">
                      <input 
                        type="text" 
                        placeholder="Nhập mã vạch hoặc tên..." 
                        className={inputClass} 
                        value={recordSearch} 
                        onChange={e => setRecordSearch(e.target.value)} 
                      />
                    </InputGroup>
                    
                    <div className="max-h-[300px] overflow-y-auto space-y-2 mt-2">
                      {filteredProductsForRecord.length === 0 ? (
                         <div className="text-center py-4 text-slate-400 text-sm bg-slate-50 rounded-xl">
                           {recordSearch ? 'Không tìm thấy sản phẩm' : 'Nhập để tìm kiếm'}
                         </div>
                      ) : (
                        filteredProductsForRecord.slice(0, 20).map(p => (
                          <div 
                            key={p.id}
                            onClick={() => handleSelectProductForRecord(p)}
                            className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all flex justify-between items-center"
                          >
                            <div>
                              <div className="font-bold text-slate-800 text-[0.9rem]">{p.name}</div>
                              <div className="text-[0.7rem] text-slate-500 font-mono">{p.barcode}</div>
                            </div>
                            <ChevronRight size={18} className="text-slate-400" />
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl mb-2 flex justify-between items-center">
                      <div>
                        <div className="text-[0.75rem] text-blue-600 font-bold mb-0.5">Đang chọn:</div>
                        <div className="font-bold text-slate-800">{selectedProduct.name}</div>
                        <div className="text-[0.7rem] text-slate-500 font-mono mt-0.5">{selectedProduct.barcode}</div>
                      </div>
                      <button 
                        onClick={() => setSelectedProduct(null)}
                        className="text-[0.75rem] font-bold text-blue-600 hover:bg-blue-100 px-2 py-1 rounded-lg"
                      >
                        Đổi
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <InputGroup label="Hạn sử dụng *">
                        <input 
                          type="date" 
                          className={inputClass} 
                          value={newRecordForm.expDate} 
                          onChange={e => {
                            const val = e.target.value;
                            const calc = calculateDestructionDate(val, newRecordForm.destroyDays === '' || isNaN(parseInt(newRecordForm.destroyDays)) ? 0 : parseInt(newRecordForm.destroyDays));
                            setNewRecordForm({ ...newRecordForm, expDate: val, destructionDate: calc });
                          }} 
                        />
                      </InputGroup>
                      
                      <InputGroup label="Ngày hủy">
                        <input 
                          type="date" 
                          className={inputClass} 
                          value={newRecordForm.destructionDate} 
                          onChange={e => setNewRecordForm({ ...newRecordForm, destructionDate: e.target.value })} 
                        />
                      </InputGroup>
                    </div>

                    <InputGroup label="Báo trước (Ngày)">
                      <input 
                        type="number" 
                        inputMode="numeric"
                        placeholder="Số ngày báo trước" 
                        className={inputClass} 
                        value={newRecordForm.destroyDays} 
                        onChange={e => {
                          const days = e.target.value;
                          const calc = calculateDestructionDate(newRecordForm.expDate, days === '' || isNaN(parseInt(days)) ? 0 : parseInt(days));
                          setNewRecordForm({ ...newRecordForm, destroyDays: days, destructionDate: calc });
                        }} 
                      />
                    </InputGroup>

                    <div className="grid grid-cols-2 gap-3">
                      <InputGroup label="Số lượng">
                        <input 
                          type="number" 
                          inputMode="numeric"
                          placeholder="SL lô này" 
                          className={inputClass} 
                          value={newRecordForm.quantity} 
                          onChange={e => setNewRecordForm({ ...newRecordForm, quantity: e.target.value })} 
                        />
                      </InputGroup>
                      
                      <InputGroup label="Ghi chú">
                        <input 
                          type="text" 
                          placeholder="VD: Kệ số 3" 
                          className={inputClass} 
                          value={newRecordForm.note} 
                          onChange={e => setNewRecordForm({ ...newRecordForm, note: e.target.value })} 
                        />
                      </InputGroup>
                    </div>

                    <button 
                      onClick={handleSaveNewRecord}
                      className="w-full mt-2 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[1rem] shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                    >
                      Lưu Record
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
        <div className="relative flex-1 shadow-sm rounded-[1.2rem] overflow-hidden bg-white border border-slate-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
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
            <div key={p.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex justify-between items-center shadow-sm">
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
}> = ({ onBack, products }) => {
  const [activeTab, setActiveTab] = useState<'sell' | 'order' | 'destruction'>('sell');
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [destructionItems, setDestructionItems] = useState<DestructionItem[]>([]);
  const [isImportingDestruction, setIsImportingDestruction] = useState(false);

  useEffect(() => {
    const unsubConsumables = subscribeConsumables((items) => {
      setConsumables(items);
    });
    const unsubDestruction = subscribeDestructionItems((items) => {
      setDestructionItems(items);
    });
    return () => {
      unsubConsumables();
      unsubDestruction();
    };
  }, []);

  const totalValue = products.reduce((sum, p) => sum + (p.price || 0), 0);
  
  // Calculate stats from all records
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

  const handleImportSell = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split('\n').slice(1);
      let count = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(',').map(v => v.replace(/"/g, '').trim());
        if (parts.length >= 2) {
          await addProductOnline({ 
            name: parts[0], 
            barcode: parts[1], 
            internalCode: parts[2] || undefined,
            destroyDaysBeforeExpiry: parseInt(parts[3]) || 0,
            price: parseInt(parts[6]) || 0
          }, 'shared'); // We made products shared
          count++;
        }
      }
      alert(`Đã import thành công ${count} Item Bán!`);
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleImportOrder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split('\n').slice(1);
      let count = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(',').map(v => v.replace(/"/g, '').trim());
        if (parts.length >= 2) {
          await addConsumableOnline({ 
            sku: parts[0], 
            name: parts[1], 
            supplier: parts[2] || undefined
          });
          count++;
        }
      }
      alert(`Đã import thành công ${count} Item Đặt Hàng!`);
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  // --- QUẢN LÝ DỮ LIỆU BIÊN BẢN HỦY HÀNG (ƯU TIÊN CSV CHUẨN UTF-8) ---
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [copiedCsvSample, setCopiedCsvSample] = useState(false);

  // Mẫu CSV chuẩn để người dùng tham khảo hoặc sao chép
  const SAMPLE_CSV_CONTENT = `STT,Mã nội bộ,Barcode,Tên hàng,Số lượng,Ghi chú
1,100234,8934567890123,Sữa tươi Tiệt trùng Vinamilk 100% Có đường 1L,3,Hộp móp rò rỉ nắp
2,100456,8935001712345,Sữa chua men sống Probi chai 65ml (lốc 5),2,Hết hạn sử dụng
3,102389,8934822001124,Bánh mì tươi chà bông Kinh Đô 50g,5,Date cận ngày
4,105670,8934588012111,Xúc xích tiệt trùng Vissan Heo dinh dưỡng 4 cây 160g,4,Bao bì rách
5,108991,8936036010022,Nước ngọt Coca-Cola Sleek lon 320ml,6,Vỏ lon móp méo
6,110245,8934563148112,Mì Omachi sườn hầm ngũ quả gói 80g,10,Gói bị xì hơi`;

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

  // Trích xuất các mặt hàng từ bảng dữ liệu lưới (CSV hoặc Excel)
  const extractDestructionItems = (rawData: any[][]): Omit<DestructionItem, 'id'>[] => {
    if (rawData.length <= 1) return [];

    // Tìm dòng tiêu đề
    let headerRowIndex = 0;
    let headers: string[] = [];
    for (let r = 0; r < Math.min(10, rawData.length); r++) {
      const row = rawData[r];
      if (Array.isArray(row)) {
        const rowStr = row.map(cell => String(cell || '').trim().toLowerCase()).join(' ');
        if (rowStr.includes('barcode') || rowStr.includes('mã') || rowStr.includes('tên') || rowStr.includes('stt')) {
          headerRowIndex = r;
          headers = row.map(cell => String(cell || '').trim().toLowerCase());
          break;
        }
      }
    }

    if (headers.length === 0) {
      headers = rawData[0].map(cell => String(cell || '').trim().toLowerCase());
    }

    const findColIdx = (keywords: string[]) => {
      return headers.findIndex(h => keywords.some(k => h.includes(k)));
    };

    const sttIdx = findColIdx(['stt', 'số thứ tự', 'no', 'tt']);
    const internalCodeIdx = findColIdx(['nội bộ', 'noi bo', 'mã nb', 'mã sp', 'sku']);
    const barcodeIdx = findColIdx(['barcode', 'mã vạch', 'ma vach', 'mã']);
    const nameIdx = findColIdx(['tên', 'ten', 'sản phẩm', 'san pham', 'mặt hàng']);
    const qtyIdx = findColIdx(['số lượng', 'so luong', 'sl', 'qty']);
    const noteIdx = findColIdx(['ghi chú', 'ghi chu', 'note', 'lý do', 'ly do']);

    const parsedItems: Omit<DestructionItem, 'id'>[] = [];
    const rows = rawData.slice(headerRowIndex + 1);

    rows.forEach((row, rIdx) => {
      if (!Array.isArray(row) || row.every(c => c === '' || c === undefined || c === null)) return;

      let sttVal: any = sttIdx >= 0 ? row[sttIdx] : (parsedItems.length + 1);
      if (sttVal === '' || sttVal === undefined) sttVal = parsedItems.length + 1;

      let nameVal = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
      let barcodeVal = barcodeIdx >= 0 ? String(row[barcodeIdx] || '').trim() : '';
      let internalCodeVal = internalCodeIdx >= 0 ? String(row[internalCodeIdx] || '').trim() : '';
      let qtyVal = qtyIdx >= 0 ? parseInt(String(row[qtyIdx]).replace(/\D/g, ''), 10) : undefined;
      let noteVal = noteIdx >= 0 ? String(row[noteIdx] || '').trim() : '';

      if (!barcodeVal && internalCodeVal) {
        barcodeVal = internalCodeVal;
      }

      if (nameVal || barcodeVal) {
        if (!nameVal) nameVal = 'Mặt hàng #' + (internalCodeVal || barcodeVal);
        if (!barcodeVal) barcodeVal = 'NB' + (internalCodeVal || (rIdx + 1));

        parsedItems.push({
          stt: sttVal,
          name: nameVal,
          barcode: barcodeVal,
          internalCode: internalCodeVal || undefined,
          quantity: isNaN(Number(qtyVal)) ? undefined : qtyVal,
          note: noteVal || undefined
        });
      }
    });

    return parsedItems;
  };

  // Nạp file CSV (hoặc Excel nếu người dùng tải lên)
  const handleImportDestructionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingDestruction(true);

    try {
      const fileNameLower = file.name.toLowerCase();
      let gridData: any[][] = [];

      if (fileNameLower.endsWith('.csv') || fileNameLower.endsWith('.txt')) {
        // Đọc trực tiếp định dạng CSV với mã hóa UTF-8
        const text = await file.text();
        gridData = parseCSVRows(text);
      } else {
        // Nếu là file Excel (.xlsx, .xls)
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        gridData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      }

      if (gridData.length <= 1) {
        alert('File không có dữ liệu!');
        setIsImportingDestruction(false);
        e.target.value = '';
        return;
      }

      const parsedItems = extractDestructionItems(gridData);

      if (parsedItems.length === 0) {
        alert('Không đọc được dòng dữ liệu hợp lệ nào từ file. Vui lòng kiểm tra lại cấu trúc file CSV theo mẫu hướng dẫn!');
      } else {
        await saveDestructionBatchOnline(parsedItems);
        alert(`Đã nạp thành công ${parsedItems.length} mặt hàng vào Biên bản hủy hàng!`);
      }
    } catch (err: any) {
      console.error('Import destruction error:', err);
      alert('Có lỗi khi đọc file: ' + (err.message || 'Lỗi định dạng'));
    } finally {
      setIsImportingDestruction(false);
      e.target.value = '';
    }
  };

  // Xuất file CSV chuẩn UTF-8 có BOM
  const handleExportDestructionCSV = () => {
    if (destructionItems.length === 0) {
      alert('Chưa có dữ liệu biên bản hủy để xuất!');
      return;
    }

    let csvContent = 'STT,Mã nội bộ,Barcode,Tên hàng,Số lượng,Ghi chú\r\n';
    destructionItems.forEach((item, idx) => {
      const stt = item.stt ?? (idx + 1);
      const internalCode = (item.internalCode || '').replace(/"/g, '""');
      const barcode = (item.barcode || '').replace(/"/g, '""');
      const name = (item.name || '').replace(/"/g, '""');
      const qty = item.quantity ?? '';
      const note = (item.note || '').replace(/"/g, '""');
      csvContent += `"${stt}","${internalCode}","${barcode}","${name}","${qty}","${note}"\r\n`;
    });

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Bien_Ban_Huy_Hang_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Tải file mẫu CSV
  const handleDownloadSampleDestructionCSV = () => {
    const blob = new Blob(['\uFEFF' + SAMPLE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Mau_File_Bien_Ban_Huy_Hang.csv';
    link.click();
  };

  // Sao chép nội dung CSV mẫu vào clipboard
  const handleCopySampleCSV = () => {
    navigator.clipboard.writeText(SAMPLE_CSV_CONTENT);
    setCopiedCsvSample(true);
    setTimeout(() => setCopiedCsvSample(false), 2000);
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

  const handleClearDestruction = async () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu Biên bản hủy hàng hiện tại không?')) {
      await clearDestructionCollection();
      alert('Đã xóa dữ liệu biên bản hủy.');
    }
  };

  const handleResetDestructionToSample = async () => {
    if (confirm('Khôi phục danh sách biên bản hủy về danh sách mẫu ban đầu?')) {
      await saveDestructionBatchOnline(INITIAL_SAMPLE_DESTRUCTION_ITEMS);
      alert('Đã khôi phục danh sách mẫu thành công!');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <Header title="DỮ LIỆU HÀNG" onBack={onBack} />
      
      {/* 3 Tabs phân chia rõ ràng */}
      <div className="grid grid-cols-3 gap-1.5 pb-4">
        <button 
          onClick={() => setActiveTab('sell')}
          className={`py-2.5 px-1 rounded-2xl font-bold text-xs transition-all shadow-sm border text-center truncate ${activeTab === 'sell' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          Item Bán Hàng
        </button>
        <button 
          onClick={() => setActiveTab('order')}
          className={`py-2.5 px-1 rounded-2xl font-bold text-xs transition-all shadow-sm border text-center truncate ${activeTab === 'order' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          Item Đặt Hàng
        </button>
        <button 
          onClick={() => setActiveTab('destruction')}
          className={`py-2.5 px-1 rounded-2xl font-bold text-xs transition-all shadow-sm border text-center truncate ${activeTab === 'destruction' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          Biên bản hủy hàng
        </button>
      </div>

      {activeTab === 'sell' && (
        <div className="animate-in fade-in zoom-in-95 duration-200">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button onClick={handleExportSell} className="py-4 bg-white border border-slate-200 text-slate-700 font-bold rounded-[1.2rem] shadow-sm flex flex-col items-center justify-center gap-2 active:scale-95 transition-all">
              <Download className="text-indigo-500" size={24} /> Xuất CSV
            </button>
            <label className="py-4 bg-white border border-slate-200 text-slate-700 font-bold rounded-[1.2rem] shadow-sm flex flex-col items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer">
              <Upload className="text-indigo-500" size={24} /> Nhập CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleImportSell} />
            </label>
            <button onClick={handleClearSell} className="col-span-2 py-4 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-[1.2rem] shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-rose-100">
              <Trash size={20} /> Xóa toàn bộ CSDL Item Bán
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-24">
            <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 text-center">
              <div className="text-[0.7rem] uppercase font-bold text-slate-400 tracking-wider mb-2">Tổng sản phẩm</div>
              <div className="text-3xl font-black text-slate-800">{products.length}</div>
            </div>
            <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 text-center">
              <div className="text-[0.7rem] uppercase font-bold text-slate-400 tracking-wider mb-2">Tổng record hạn</div>
              <div className="text-3xl font-black text-blue-600">{totalRecords}</div>
            </div>
            <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 text-center col-span-2">
              <div className="text-[0.7rem] uppercase font-bold text-slate-400 tracking-wider mb-1">Tổng giá trị hàng</div>
              <div className="text-2xl font-black text-emerald-600">{totalValue.toLocaleString('vi-VN')}đ</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'order' && (
        <div className="animate-in fade-in zoom-in-95 duration-200">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button onClick={handleExportOrder} className="py-4 bg-white border border-slate-200 text-slate-700 font-bold rounded-[1.2rem] shadow-sm flex flex-col items-center justify-center gap-2 active:scale-95 transition-all">
              <Download className="text-blue-500" size={24} /> Xuất CSV
            </button>
            <label className="py-4 bg-white border border-slate-200 text-slate-700 font-bold rounded-[1.2rem] shadow-sm flex flex-col items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer">
              <Upload className="text-blue-500" size={24} /> Nhập CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleImportOrder} />
            </label>
            <button onClick={handleClearOrder} className="col-span-2 py-4 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-[1.2rem] shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-rose-100">
              <Trash size={20} /> Xóa toàn bộ CSDL Item Đặt Hàng
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-24">
            <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 text-center col-span-2">
              <div className="text-[0.7rem] uppercase font-bold text-slate-400 tracking-wider mb-2">Tổng mặt hàng đặt</div>
              <div className="text-3xl font-black text-blue-600">{consumables.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB BIÊN BẢN HỦY HÀNG (ĐẦU VÀO CSV CHUẨN UTF-8) */}
      {activeTab === 'destruction' && (
        <div className="animate-in fade-in zoom-in-95 duration-200 space-y-4 pb-24">
          
          {/* Banner hướng dẫn nhanh cấu trúc CSV */}
          <div className="bg-linear-to-r from-rose-50 to-orange-50 border border-rose-200/80 rounded-2xl p-3.5 flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                <FileText size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-rose-950">Định dạng file: CSV (UTF-8)</h4>
                <p className="text-[0.72rem] text-rose-800/80 mt-0.5 leading-relaxed">
                  Cấu trúc 6 cột: <span className="font-semibold text-rose-950">STT, Mã nội bộ, Barcode, Tên hàng, Số lượng, Ghi chú</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCsvModal(true)}
              className="px-2.5 py-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold shrink-0 transition-all shadow-xs flex items-center gap-1 active:scale-95"
            >
              <HelpCircle size={14} />
              Xem mẫu
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Nút nhập file CSV */}
            <label className="py-4 px-3 bg-white border border-slate-200 hover:border-rose-300 text-slate-700 font-bold rounded-[1.2rem] shadow-sm flex flex-col items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer text-center">
              <Upload className="text-rose-600" size={24} />
              <div className="text-xs">
                <span className="block text-slate-800 font-extrabold text-[0.82rem]">Nhập file CSV</span>
                <span className="text-[0.68rem] text-slate-400 font-normal">Tự nhận diện Barcode & Tên hàng</span>
              </div>
              <input 
                type="file" 
                accept=".csv, .txt, .xlsx, .xls" 
                className="hidden" 
                onChange={handleImportDestructionFile}
                disabled={isImportingDestruction}
              />
            </label>

            {/* Nút xuất file CSV */}
            <button 
              onClick={handleExportDestructionCSV} 
              className="py-4 px-3 bg-white border border-slate-200 hover:border-rose-300 text-slate-700 font-bold rounded-[1.2rem] shadow-sm flex flex-col items-center justify-center gap-2 active:scale-95 transition-all text-center"
            >
              <Download className="text-rose-600" size={24} />
              <div className="text-xs">
                <span className="block text-slate-800 font-extrabold text-[0.82rem]">Xuất file CSV</span>
                <span className="text-[0.68rem] text-slate-400 font-normal">Tải về danh sách hiện tại (.csv)</span>
              </div>
            </button>
          </div>

          {/* Nút tải file mẫu CSV và nạp mẫu */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleDownloadSampleDestructionCSV}
              className="py-3 px-3 bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 transition-all active:scale-95"
            >
              <FileDown size={16} className="text-blue-500" />
              Tải file mẫu CSV
            </button>
            <button
              onClick={handleResetDestructionToSample}
              className="py-3 px-3 bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 transition-all active:scale-95"
            >
              <RotateCcw size={16} className="text-amber-500" />
              Nạp dữ liệu mẫu ban đầu
            </button>
          </div>

          {/* Thẻ thống kê */}
          <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-[0.7rem] uppercase font-bold text-slate-400 tracking-wider mb-1">
                Số mặt hàng trong biên bản hủy
              </div>
              <div className="text-3xl font-black text-rose-600">
                {destructionItems.length}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <FileText size={24} />
            </div>
          </div>

          {/* Xem trước nhanh 5 dòng đầu */}
          {destructionItems.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-3.5">
              <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>Xem trước danh sách ({destructionItems.length} hàng):</span>
                <span className="text-[0.7rem] text-slate-400">Hiển thị 5 dòng đầu</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {destructionItems.slice(0, 5).map((it, idx) => (
                  <div key={it.id || idx} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[0.7rem] shrink-0">
                        #{it.stt ?? (idx + 1)}
                      </span>
                      <span className="font-medium text-slate-800 truncate text-[0.82rem]">{it.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[0.7rem] font-mono text-slate-500 shrink-0">
                      {it.internalCode && <span className="bg-blue-50 text-blue-700 px-1 py-0.5 rounded">{it.internalCode}</span>}
                      <span>{it.barcode}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nút xóa sạch CSDL Biên bản hủy */}
          <button 
            onClick={handleClearDestruction} 
            className="w-full py-4 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-[1.2rem] shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-rose-100 text-xs"
          >
            <Trash size={18} /> Xóa toàn bộ CSDL Biên Bản Hủy Hàng
          </button>
        </div>
      )}

      {/* MODAL CHI TIẾT CẤU TRÚC FILE CSV ĐỂ TỰ NHẬP */}
      <AnimatePresence>
        {showCsvModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => setShowCsvModal(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-5 shadow-2xl z-10 max-h-[90vh] overflow-y-auto space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Cấu trúc File CSV Hủy Hàng</h3>
                    <p className="text-[0.7rem] text-slate-400">Định dạng chuẩn để bạn tự nhập file</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCsvModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Bảng giải thích chi tiết các cột */}
              <div className="space-y-2 text-xs">
                <div className="font-bold text-slate-700">Các cột dữ liệu (thứ tự ưu tiên):</div>
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-[0.75rem]">
                  <div className="bg-slate-50 p-2 font-bold text-slate-700 grid grid-cols-12 gap-1">
                    <span className="col-span-3">Tên cột</span>
                    <span className="col-span-3">Bắt buộc?</span>
                    <span className="col-span-6">Mô tả & Ví dụ</span>
                  </div>
                  <div className="p-2 grid grid-cols-12 gap-1 items-center">
                    <span className="col-span-3 font-mono font-bold text-rose-600">STT</span>
                    <span className="col-span-3 text-slate-500">Khuyên dùng</span>
                    <span className="col-span-6 text-slate-600">Số thứ tự trên biên bản giấy in (1, 2, 3...) để dễ tra cứu</span>
                  </div>
                  <div className="p-2 grid grid-cols-12 gap-1 items-center">
                    <span className="col-span-3 font-mono font-bold text-blue-600">Mã nội bộ</span>
                    <span className="col-span-3 text-emerald-600 font-medium">Bắt buộc*</span>
                    <span className="col-span-6 text-slate-600">Mã sản phẩm nội bộ (ví dụ: <code className="bg-slate-100 px-1 py-0.5 rounded">100234</code>)</span>
                  </div>
                  <div className="p-2 grid grid-cols-12 gap-1 items-center">
                    <span className="col-span-3 font-mono font-bold text-indigo-600">Barcode</span>
                    <span className="col-span-3 text-emerald-600 font-medium">Bắt buộc*</span>
                    <span className="col-span-6 text-slate-600">Mã vạch sản phẩm (ví dụ: <code className="bg-slate-100 px-1 py-0.5 rounded">8934567890123</code>)</span>
                  </div>
                  <div className="p-2 grid grid-cols-12 gap-1 items-center">
                    <span className="col-span-3 font-mono font-bold text-slate-800">Tên hàng</span>
                    <span className="col-span-3 text-rose-600 font-bold">Bắt buộc</span>
                    <span className="col-span-6 text-slate-600">Tên đầy đủ của sản phẩm</span>
                  </div>
                  <div className="p-2 grid grid-cols-12 gap-1 items-center">
                    <span className="col-span-3 font-mono font-bold text-slate-600">Số lượng</span>
                    <span className="col-span-3 text-slate-400">Tùy chọn</span>
                    <span className="col-span-6 text-slate-600">Số lượng ghi trên biên bản (nếu có, hoặc để trống)</span>
                  </div>
                  <div className="p-2 grid grid-cols-12 gap-1 items-center">
                    <span className="col-span-3 font-mono font-bold text-slate-600">Ghi chú</span>
                    <span className="col-span-3 text-slate-400">Tùy chọn</span>
                    <span className="col-span-6 text-slate-600">Lý do hủy: Hết hạn, móp méo, rách bao bì...</span>
                  </div>
                </div>
                <p className="text-[0.7rem] text-slate-400 italic">
                  * Ghi chú: Nếu file có Mã nội bộ thì Barcode có thể tự lấy theo Mã nội bộ và ngược lại.
                </p>
              </div>

              {/* Khung nội dung CSV mẫu copy trực tiếp */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Nội dung file CSV mẫu:</span>
                  <button
                    onClick={handleCopySampleCSV}
                    className="flex items-center gap-1 text-[0.72rem] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2 py-1 rounded-lg transition-all"
                  >
                    {copiedCsvSample ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    {copiedCsvSample ? 'Đã sao chép!' : 'Sao chép văn bản'}
                  </button>
                </div>
                <div className="bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-[0.72rem] leading-relaxed overflow-x-auto whitespace-pre selection:bg-rose-500 selection:text-white">
                  {SAMPLE_CSV_CONTENT}
                </div>
              </div>

              {/* Hướng dẫn lưu file CSV trong Excel / Notepad */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[0.72rem] text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1 text-amber-950">
                  <HelpCircle size={14} className="text-amber-600" />
                  Mẹo khi tạo file bằng Excel / Notepad:
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                  <li>Trong Excel: Chọn <strong>Save As</strong> &gt; Định dạng <strong>CSV UTF-8 (Comma delimited) (*.csv)</strong> để không bị lỗi dấu tiếng Việt.</li>
                  <li>Trong Notepad: Dán văn bản vào &gt; Chọn <strong>Save As</strong> &gt; Đặt đuôi <code className="bg-amber-100 px-1 rounded">.csv</code> &gt; Encoding chọn <strong>UTF-8</strong>.</li>
                </ul>
              </div>

              {/* Nút hành động */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadSampleDestructionCSV}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-500/20 active:scale-95 transition-all"
                >
                  <FileDown size={16} />
                  Tải file .CSV mẫu về máy
                </button>
                <button
                  type="button"
                  onClick={() => setShowCsvModal(false)}
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};

