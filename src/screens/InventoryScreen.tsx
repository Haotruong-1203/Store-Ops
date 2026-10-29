import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  PackageOpen, 
  Package,
  ShoppingCart,
  Save, 
  Trash2, 
  Edit2, 
  X, 
  Check, 
  Search, 
  User, 
  Users, 
  Globe, 
  FileImage, 
  Share2,
  Barcode as BarcodeIcon,
  Tag,
  Layers,
  HelpCircle
} from 'lucide-react';
import { Header, EmptyState } from '../components/SharedUI';
import { OrderImageModal } from '../components/OrderImageModal';
import { PRESET_USERS } from '../lib/auth';
import { 
  Product, 
  addProductOnline, 
  updateProductOnline, 
  deleteProductOnline 
} from '../lib/firestoreService';
import { 
  ConsumableOrder, 
  ConsumableRecord,
  ConsumableItem,
  subscribeConsumableOrders,
  saveConsumableOrderOnline,
  updateConsumableOrderOnline,
  deleteConsumableOrderOnline,
  subscribeConsumables,
  addConsumableOnline,
  updateConsumableOnline,
  deleteConsumableOnline
} from '../lib/consumableService';

export interface InventoryScreenProps {
  onBack: () => void;
  currentUser: { username: string; name: string; role: 'admin' | 'user' };
  products?: Product[];
  onAddProduct?: (p: Omit<Product, 'id'>) => Promise<void>;
  onUpdateProduct?: (p: Product) => Promise<void>;
  initialOrderMode?: 'consumable' | 'general' | null;
}

export interface CatalogItem {
  key: string;
  sku: string;
  barcode: string;
  internalCode?: string;
  name: string;
  price?: number;
  isGeneral: boolean;
  rawProduct?: Product;
  rawConsumable?: ConsumableItem;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({ 
  onBack, 
  currentUser,
  products = [],
  onAddProduct,
  onUpdateProduct,
  initialOrderMode = 'consumable'
}) => {
  // Chế độ đặt hàng: 'consumable' (Vật tư tiêu hao) hoặc 'general' (Hàng khác - Item Bán Hàng)
  const [orderMode, setOrderMode] = useState<'consumable' | 'general'>(initialOrderMode || 'consumable');
  
  // Đồng bộ khi prop initialOrderMode thay đổi từ bên ngoài (HomeScreen)
  useEffect(() => {
    if (initialOrderMode) {
      setOrderMode(initialOrderMode);
    }
  }, [initialOrderMode]);

  const [activeTab, setActiveTab] = useState<'saved' | 'order'>('order');
  const [savedFilter, setSavedFilter] = useState<'all' | 'mine'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data state
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [orders, setOrders] = useState<ConsumableOrder[]>([]);
  
  // Số lượng đặt riêng biệt cho từng chế độ để không bị lẫn lộn khi chuyển qua lại
  const [consumableQuantities, setConsumableQuantities] = useState<Record<string, string>>({});
  const [generalQuantities, setGeneralQuantities] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Số lượng đang thao tác theo chế độ hiện tại
  const quantities = orderMode === 'consumable' ? consumableQuantities : generalQuantities;
  const setQuantities = orderMode === 'consumable' ? setConsumableQuantities : setGeneralQuantities;

  // Edit order state (Sửa đợt đặt hàng đã lưu)
  const [editingOrder, setEditingOrder] = useState<ConsumableOrder | null>(null);
  const [editQuantities, setEditQuantities] = useState<Record<string, string>>({});
  const [editSearchTerm, setEditSearchTerm] = useState('');

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemBarcode, setNewItemBarcode] = useState('');
  const [newItemInternalCode, setNewItemInternalCode] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');

  // Edit Item Modal (Chỉnh sửa tên hoặc barcode)
  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemBarcode, setEditItemBarcode] = useState('');
  const [editItemInternalCode, setEditItemInternalCode] = useState('');

  // Export Order Image Modal
  const [exportOrder, setExportOrder] = useState<{ order: ConsumableOrder; number: number } | null>(null);

  useEffect(() => {
    // Lắng nghe tất cả các đợt đặt hàng (public chung trên Firestore)
    const unsubscribeOrders = subscribeConsumableOrders('all', (data) => {
      setOrders(data);
    });
    
    // Lắng nghe danh mục consumable
    const unsubscribeConsumables = subscribeConsumables((items) => {
      setConsumables(items);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeConsumables();
    };
  }, []);

  // Danh mục mặt hàng đồng nhất theo chế độ đang chọn
  const activeCatalog: CatalogItem[] = useMemo(() => {
    if (orderMode === 'consumable') {
      return consumables.map((c) => ({
        key: c.sku,
        sku: c.sku,
        barcode: c.barcode || c.sku,
        name: c.name || '',
        isGeneral: false,
        rawConsumable: c
      }));
    } else {
      // Chế độ 'general' -> Lấy toàn bộ từ CSDL "Item bán hàng"
      return products.map((p) => {
        const key = p.barcode || String(p.id);
        return {
          key: key,
          sku: key,
          barcode: p.barcode || '',
          internalCode: p.internalCode || undefined,
          name: p.name || '',
          price: p.price,
          isGeneral: true,
          rawProduct: p
        };
      });
    }
  }, [orderMode, consumables, products]);

  // Tìm kiếm theo Tên, Barcode hoặc Mã nội bộ
  const filteredCatalog = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return activeCatalog;
    return activeCatalog.filter(item => {
      const nameMatch = (item.name || '').toLowerCase().includes(term);
      const barcodeMatch = (item.barcode || '').toLowerCase().includes(term);
      const skuMatch = (item.sku || '').toLowerCase().includes(term);
      const internalMatch = (item.internalCode || '').toLowerCase().includes(term);
      return nameMatch || barcodeMatch || skuMatch || internalMatch;
    });
  }, [activeCatalog, searchTerm]);

  // Danh sách hiển thị trong Modal chỉnh sửa đơn hàng đã lưu
  const editModalCatalog = useMemo(() => {
    if (!editingOrder) return [];
    const isGeneralOrder = editingOrder.orderType === 'general';
    
    // Chọn đúng nguồn dữ liệu theo loại đơn hàng đang sửa
    const baseItems: CatalogItem[] = isGeneralOrder
      ? products.map(p => ({
          key: p.barcode || String(p.id),
          sku: p.barcode || String(p.id),
          barcode: p.barcode || '',
          internalCode: p.internalCode || undefined,
          name: p.name || '',
          price: p.price,
          isGeneral: true,
          rawProduct: p
        }))
      : consumables.map(c => ({
          key: c.sku,
          sku: c.sku,
          barcode: c.barcode || c.sku,
          name: c.name || '',
          isGeneral: false,
          rawConsumable: c
        }));

    const term = editSearchTerm.trim().toLowerCase();
    const filtered = baseItems.filter(item => {
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) || 
        item.sku.toLowerCase().includes(term) ||
        (item.barcode && item.barcode.toLowerCase().includes(term)) ||
        (item.internalCode && item.internalCode.toLowerCase().includes(term))
      );
    });

    // Ưu tiên đưa các món đã có số lượng đặt lên đầu
    const orderedSet = new Set<string>();
    editingOrder.records.forEach(r => orderedSet.add(r.id));
    Object.keys(editQuantities).forEach(key => {
      const q = parseInt(editQuantities[key]);
      if (q && q > 0) orderedSet.add(key);
    });

    return [...filtered].sort((a, b) => {
      const aOrdered = orderedSet.has(a.key) ? 1 : 0;
      const bOrdered = orderedSet.has(b.key) ? 1 : 0;
      if (aOrdered !== bOrdered) {
        return bOrdered - aOrdered;
      }
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [consumables, products, editingOrder, editSearchTerm, editQuantities]);

  // Các đơn hàng đã lưu được lọc theo chế độ hiện tại (Consumable hoặc Hàng khác)
  const displayedOrders = useMemo(() => {
    const modeOrders = orders.filter(o => {
      const type = o.orderType || 'consumable';
      return type === orderMode;
    });

    if (savedFilter === 'mine') {
      return modeOrders.filter(o => o.userId === currentUser.username);
    }
    return modeOrders;
  }, [orders, orderMode, savedFilter, currentUser.username]);

  const myOrdersCount = useMemo(() => {
    const modeOrders = orders.filter(o => (o.orderType || 'consumable') === orderMode);
    return modeOrders.filter(o => o.userId === currentUser.username).length;
  }, [orders, orderMode, currentUser.username]);

  const handleQuantityChange = (key: string, value: string) => {
    setQuantities(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Mở modal tạo mới sản phẩm và tự động nhận diện từ khóa
  const handleOpenAddModal = (initialKeyword: string = '') => {
    const kw = initialKeyword.trim();
    const isDigits = /^\d{4,}$/.test(kw);
    if (isDigits) {
      setNewItemBarcode(kw);
      setNewItemName('');
    } else {
      setNewItemName(kw);
      setNewItemBarcode('');
    }
    setNewItemInternalCode('');
    setNewItemQuantity('');
    setIsAddModalOpen(true);
  };

  // Lưu tạo mới sản phẩm vào CSDL tương ứng
  const handleAddNewItem = async () => {
    const trimmedName = newItemName.trim();
    if (!trimmedName) {
      alert("Vui lòng nhập tên sản phẩm!");
      return;
    }
    const trimmedBarcode = newItemBarcode.trim();
    const trimmedInternal = newItemInternalCode.trim();

    try {
      if (orderMode === 'consumable') {
        // Chế độ Consumable: Thêm vào collection consumables
        const sku = trimmedBarcode || `ITM-${Date.now().toString().slice(-6)}`;
        await addConsumableOnline({ 
          sku, 
          barcode: trimmedBarcode, 
          name: trimmedName 
        });

        const qtyNum = parseInt(newItemQuantity);
        if (!isNaN(qtyNum) && qtyNum > 0) {
          setConsumableQuantities(prev => ({
            ...prev,
            [sku]: String(qtyNum)
          }));
        }
      } else {
        // Chế độ Đặt hàng khác: Thêm vào collection products (Item Bán Hàng)
        const finalBarcode = trimmedBarcode || `NB${Date.now().toString().slice(-6)}`;
        const newProduct: Omit<Product, 'id'> = {
          barcode: finalBarcode,
          name: trimmedName,
          internalCode: trimmedInternal || undefined,
          price: 0,
          destroyDaysBeforeExpiry: 0,
          destructionDate: '',
          expiryRecords: []
        };

        if (onAddProduct) {
          await onAddProduct(newProduct);
        } else {
          await addProductOnline(newProduct, 'shared');
        }

        const qtyNum = parseInt(newItemQuantity);
        if (!isNaN(qtyNum) && qtyNum > 0) {
          setGeneralQuantities(prev => ({
            ...prev,
            [finalBarcode]: String(qtyNum)
          }));
        }
      }

      setIsAddModalOpen(false);
      setNewItemName('');
      setNewItemBarcode('');
      setNewItemInternalCode('');
      setNewItemQuantity('');
      setSearchTerm('');
    } catch (error) {
      console.error('Error adding item:', error);
      alert("Lỗi khi thêm sản phẩm.");
    }
  };

  // Mở modal sửa thông tin sản phẩm (Tên, Barcode, Mã nội bộ)
  const handleOpenEditItem = (item: CatalogItem) => {
    setEditingItem(item);
    setEditItemName(item.name || '');
    setEditItemBarcode(item.barcode || (item.sku.startsWith('ITM-') ? '' : item.sku));
    setEditItemInternalCode(item.internalCode || '');
    setIsEditItemModalOpen(true);
  };

  // Lưu chỉnh sửa sản phẩm vào CSDL tương ứng
  const handleSaveEditItem = async () => {
    if (!editingItem) return;
    const trimmedName = editItemName.trim();
    if (!trimmedName) {
      alert("Vui lòng nhập tên sản phẩm!");
      return;
    }
    const trimmedBarcode = editItemBarcode.trim();
    const trimmedInternal = editItemInternalCode.trim();

    try {
      if (editingItem.isGeneral && editingItem.rawProduct) {
        // Cập nhật Item Bán Hàng
        const updatedProduct: Product = {
          ...editingItem.rawProduct,
          name: trimmedName,
          barcode: trimmedBarcode || editingItem.rawProduct.barcode,
          internalCode: trimmedInternal || undefined
        };

        if (onUpdateProduct) {
          await onUpdateProduct(updatedProduct);
        } else {
          await updateProductOnline(updatedProduct);
        }

        const oldKey = editingItem.key;
        const newKey = updatedProduct.barcode;
        if (oldKey !== newKey && generalQuantities[oldKey]) {
          setGeneralQuantities(prev => {
            const next = { ...prev, [newKey]: prev[oldKey] };
            delete next[oldKey];
            return next;
          });
        }
      } else if (editingItem.rawConsumable) {
        // Cập nhật Item Consumable
        const newSku = trimmedBarcode || editingItem.rawConsumable.sku;
        await updateConsumableOnline({
          ...editingItem.rawConsumable,
          sku: newSku,
          barcode: trimmedBarcode,
          name: trimmedName
        });

        const oldKey = editingItem.key;
        if (oldKey !== newSku && consumableQuantities[oldKey]) {
          setConsumableQuantities(prev => {
            const next = { ...prev, [newSku]: prev[oldKey] };
            delete next[oldKey];
            return next;
          });
        }
      }

      setIsEditItemModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Error saving item:', error);
      alert("Lỗi khi cập nhật sản phẩm.");
    }
  };

  // Xóa sản phẩm khỏi CSDL
  const handleDeleteItem = async (item: CatalogItem) => {
    if (!window.confirm(`Bạn có chắc muốn xóa "${item.name}" khỏi danh mục không?`)) return;
    try {
      if (item.isGeneral && item.rawProduct) {
        if (item.rawProduct.id) {
          await deleteProductOnline(item.rawProduct.id);
        }
      } else if (item.rawConsumable) {
        const docId = item.rawConsumable.id || ('csm-' + item.rawConsumable.sku);
        await deleteConsumableOnline(docId);
      }
      setIsEditItemModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Error deleting item:', error);
      alert("Lỗi khi xóa sản phẩm.");
    }
  };

  // Lưu đợt đặt hàng mới lên Firestore
  const handleSaveOrder = async () => {
    const validRecords: ConsumableRecord[] = [];
    
    activeCatalog.forEach(item => {
      const qtyStr = quantities[item.key];
      const qty = parseInt(qtyStr);
      if (qty && qty > 0) {
        validRecords.push({
          id: item.key,
          name: item.name,
          quantity: qty,
          creatorName: currentUser.name
        });
      }
    });

    if (validRecords.length === 0) {
      alert("Vui lòng điền số lượng cho ít nhất 1 mặt hàng.");
      return;
    }

    setIsSaving(true);
    try {
      await saveConsumableOrderOnline({
        createdAt: new Date().toISOString(),
        records: validRecords,
        userId: currentUser.username,
        creatorName: currentUser.name,
        orderType: orderMode
      });
      
      const typeLabel = orderMode === 'consumable' ? 'Consumable' : 'Hàng khác (Item Bán Hàng)';
      alert(`Đã lưu đợt đặt hàng ${typeLabel} thành công vào hệ thống chung!`);
      setQuantities({});
      setActiveTab('saved');
    } catch (e) {
      console.error('Save order error:', e);
      alert("Có lỗi xảy ra khi lưu.");
    } finally {
      setIsSaving(false);
    }
  };

  // Xóa đợt đặt hàng đã lưu
  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa đợt đặt hàng này khỏi hệ thống?")) return;
    try {
      await deleteConsumableOrderOnline(orderId);
    } catch (error) {
      alert("Có lỗi xảy ra khi xóa đợt đặt hàng.");
    }
  };

  // Mở modal sửa đợt đặt hàng đã lưu
  const handleOpenEdit = (order: ConsumableOrder) => {
    const qtys: Record<string, string> = {};
    order.records.forEach(r => {
      qtys[r.id] = r.quantity.toString();
    });
    setEditQuantities(qtys);
    setEditSearchTerm('');
    setEditingOrder(order);
  };

  // Lưu chỉnh sửa đợt đặt hàng
  const handleSaveEdit = async () => {
    if (!editingOrder) return;
    const isGeneralOrder = editingOrder.orderType === 'general';
    const baseItems = isGeneralOrder ? products : consumables;
    
    const validRecords: ConsumableRecord[] = [];
    baseItems.forEach((raw: any) => {
      const key = isGeneralOrder ? (raw.barcode || String(raw.id)) : raw.sku;
      const qtyStr = editQuantities[key];
      const qty = parseInt(qtyStr);
      if (qty && qty > 0) {
        const existingRecord = editingOrder.records.find(r => r.id === key);
        validRecords.push({
          id: key,
          name: raw.name,
          quantity: qty,
          creatorName: existingRecord?.creatorName || editingOrder.creatorName || currentUser.name
        });
      }
    });

    if (validRecords.length === 0) {
      alert("Vui lòng điền số lượng cho ít nhất 1 mặt hàng hoặc xóa luôn đợt này.");
      return;
    }

    try {
      await updateConsumableOrderOnline({
        ...editingOrder,
        records: validRecords
      });
      alert("Cập nhật thành công!");
      setEditingOrder(null);
    } catch (e) {
      console.error('Update order error:', e);
      alert("Có lỗi xảy ra khi cập nhật.");
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col h-full bg-slate-50 absolute inset-0">
      <div className="pt-safe px-4 shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200 z-10 shadow-sm">
        <Header 
          title={orderMode === 'consumable' ? "ĐẶT HÀNG (CONSUMABLE)" : "ĐẶT HÀNG KHÁC (ITEM BÁN)"} 
          onBack={onBack} 
        />
        
        {/* Switcher 2 chế độ: Đặt Consumable & Đặt hàng khác */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl mb-3 shadow-inner">
          <button 
            type="button"
            onClick={() => {
              setOrderMode('consumable');
              setSearchTerm('');
            }}
            className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              orderMode === 'consumable' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Package size={15} />
            <span>Đặt Consumable</span>
          </button>
          
          <button 
            type="button"
            onClick={() => {
              setOrderMode('general');
              setSearchTerm('');
            }}
            className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              orderMode === 'general' 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ShoppingCart size={15} />
            <span>Đặt hàng khác (Item bán)</span>
          </button>
        </div>

        {/* 2 Tabs: Bảng Đặt Hàng & Đã Lưu */}
        <div className="flex gap-2 pb-4">
          <button 
            onClick={() => setActiveTab('order')}
            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm border ${
              activeTab === 'order' 
                ? (orderMode === 'consumable' ? 'bg-blue-600 text-white border-blue-600' : 'bg-emerald-600 text-white border-emerald-600') 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Bảng Đặt Hàng
          </button>
          <button 
            onClick={() => setActiveTab('saved')}
            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm border ${
              activeTab === 'saved' 
                ? (orderMode === 'consumable' ? 'bg-blue-600 text-white border-blue-600' : 'bg-emerald-600 text-white border-emerald-600') 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Đã Lưu ({displayedOrders.length})
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar pb-32">
        {/* TAB 1: BẢNG ĐẶT HÀNG */}
        {activeTab === 'order' && (
          <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 relative min-h-full">
             
             {/* Top Action Bar: Count + Tạo mới sản phẩm button */}
             <div className="flex items-center justify-between gap-2 mb-3">
               <div>
                 <h3 className="font-bold text-slate-800 text-sm">
                   {orderMode === 'consumable' ? 'Danh mục Consumable' : 'Danh mục Item Bán Hàng'}
                 </h3>
                 <p className="text-[0.72rem] text-slate-500">
                   Hiển thị {filteredCatalog.length} / {activeCatalog.length} mặt hàng
                 </p>
               </div>
               <button 
                 type="button"
                 onClick={() => handleOpenAddModal(searchTerm)}
                 className={`px-3.5 py-2 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer ${
                   orderMode === 'consumable' 
                     ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25' 
                     : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25'
                 }`}
               >
                 <Plus size={15} />
                 <span>Tạo mới sản phẩm</span>
               </button>
             </div>

             {/* Search box */}
             <div className="mb-4">
               <div className="relative">
                 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                 <input 
                   type="text" 
                   placeholder={orderMode === 'consumable' ? "Tìm tên vật tư hoặc mã barcode..." : "Tìm theo tên, barcode hoặc mã nội bộ..."}
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                   className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all font-medium"
                 />
                 {searchTerm && (
                   <button 
                     onClick={() => setSearchTerm('')}
                     className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                   >
                     <X size={16} />
                   </button>
                 )}
               </div>
             </div>

             {/* Table header */}
             <div className="grid grid-cols-12 gap-2 pb-2 mb-2 border-b border-slate-100 text-[0.7rem] font-bold text-slate-400 uppercase tracking-wider">
               <div className="col-span-4 sm:col-span-3">Barcode / Mã SP</div>
               <div className="col-span-5 sm:col-span-6">Tên sản phẩm</div>
               <div className="col-span-3 text-center">Số lượng đặt</div>
             </div>
             
             {/* Gợi ý tạo mới khi search không ra món hàng */}
             {filteredCatalog.length === 0 ? (
               <div className="p-6 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 border-2 border-dashed border-blue-200 rounded-3xl text-center space-y-3 my-4">
                 <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
                   <PackageOpen size={24} />
                 </div>
                 <div>
                   <h4 className="font-extrabold text-slate-800 text-[0.95rem]">
                     {searchTerm ? `Không tìm thấy món "${searchTerm}"` : "Chưa có sản phẩm nào"}
                   </h4>
                   <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                     {searchTerm 
                       ? `Mặt hàng này chưa có trong ${orderMode === 'consumable' ? 'danh mục Consumable' : 'danh mục Item Bán Hàng'}. Bạn có thể tạo mới ngay dưới đây:`
                       : "Danh mục đang trống. Bấm nút dưới để tạo mới mặt hàng đầu tiên:"}
                   </p>
                 </div>
                 <button 
                   type="button"
                   onClick={() => handleOpenAddModal(searchTerm)}
                   className={`w-full sm:w-auto px-5 py-3 text-white font-bold rounded-xl text-xs inline-flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer ${
                     orderMode === 'consumable' 
                       ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20' 
                       : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20'
                   }`}
                 >
                   <Plus size={16} /> {searchTerm ? `Tạo mới "${searchTerm}" vào đơn đặt` : "Tạo mới sản phẩm đặt hàng"}
                 </button>
               </div>
             ) : (
               <div className="space-y-1.5">
                 {filteredCatalog.map((item) => {
                   const hasQty = Boolean(quantities[item.key] && parseInt(quantities[item.key]) > 0);
                   const displayCode = item.barcode || item.sku;
                   return (
                     <div 
                       key={item.key} 
                       className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded-2xl transition-all ${
                         hasQty 
                           ? (orderMode === 'consumable' ? 'bg-blue-50/80 border border-blue-200/80 shadow-xs' : 'bg-emerald-50/80 border border-emerald-200/80 shadow-xs')
                           : 'border-b border-slate-50 last:border-0 hover:bg-slate-50/80'
                       }`}
                     >
                       <div className="col-span-4 sm:col-span-3 min-w-0 pr-1">
                         <div className="text-[0.72rem] font-mono font-bold text-slate-700 truncate flex items-center gap-1" title={displayCode}>
                           {item.barcode && <BarcodeIcon size={12} className="text-slate-400 shrink-0" />}
                           <span className="truncate">{displayCode}</span>
                         </div>
                         {item.internalCode && (
                           <div className="text-[0.62rem] font-mono font-bold text-indigo-600 truncate mt-0.5">
                             #{item.internalCode}
                           </div>
                         )}
                       </div>

                       <div className="col-span-5 sm:col-span-6 pr-1 flex items-center justify-between gap-1 group">
                         <div className="min-w-0 flex-1">
                           <span className="text-[0.82rem] font-semibold text-slate-800 leading-snug line-clamp-2">
                             {item.name}
                           </span>
                           {item.price !== undefined && item.price > 0 && (
                             <span className="text-[0.68rem] font-bold text-slate-500 block">
                               {item.price.toLocaleString('vi-VN')}đ
                             </span>
                           )}
                         </div>
                         <button
                           type="button"
                           onClick={() => handleOpenEditItem(item)}
                           title="Chỉnh sửa tên hoặc barcode"
                           className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors shrink-0 cursor-pointer active:scale-95"
                         >
                           <Edit2 size={13} />
                         </button>
                       </div>

                       <div className="col-span-3">
                         <input 
                           type="number" 
                           inputMode="numeric" 
                           pattern="[0-9]*" 
                           min="0"
                           placeholder="0"
                           value={quantities[item.key] || ''}
                           onChange={(e) => handleQuantityChange(item.key, e.target.value)}
                           className={`w-full rounded-xl px-2 py-2 text-center text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all ${
                             hasQty 
                               ? (orderMode === 'consumable' 
                                   ? 'bg-white border-2 border-blue-500 text-blue-700 shadow-xs font-black' 
                                   : 'bg-white border-2 border-emerald-500 text-emerald-700 shadow-xs font-black') 
                               : 'bg-slate-100 border border-slate-200 text-slate-800 focus:bg-white'
                           }`}
                         />
                       </div>
                     </div>
                   );
                 })}
               </div>
             )}

          </div>
        )}

        {/* TAB 2: ĐÃ LƯU */}
        {activeTab === 'saved' && (
          <div className="space-y-4">
            {/* Status & Filter Bar */}
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[0.7rem] border ${
                  orderMode === 'consumable' 
                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  {orderMode === 'consumable' ? <Package size={11} /> : <ShoppingCart size={11} />}
                  {orderMode === 'consumable' ? 'Đơn Consumable' : 'Đơn Hàng Khác'}
                </span>
                <span>Dữ liệu hiển thị cho tất cả tài khoản</span>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setSavedFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    savedFilter === 'all'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Tất cả ({displayedOrders.length})
                </button>
                <button
                  onClick={() => setSavedFilter('mine')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    savedFilter === 'mine'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Của tôi ({myOrdersCount})
                </button>
              </div>
            </div>

            {displayedOrders.length === 0 ? (
              <EmptyState 
                icon={<PackageOpen size={48} />} 
                message={savedFilter === 'mine' 
                  ? `Bạn chưa lưu đợt đặt hàng ${orderMode === 'consumable' ? 'Consumable' : 'Hàng khác'} nào.` 
                  : `Chưa có đợt đặt hàng ${orderMode === 'consumable' ? 'Consumable' : 'Hàng khác'} nào được lưu.`} 
              />
            ) : (
              displayedOrders.map((order, idx) => {
                const orderCreator = order.creatorName || (PRESET_USERS[order.userId]?.name) || order.userId || 'Người dùng';
                const isOwnerOrAdmin = currentUser.role === 'admin' || order.userId === currentUser.username;
                const totalQuantity = order.records.reduce((acc, r) => acc + (r.quantity || 0), 0);
                const isGeneral = order.orderType === 'general';

                return (
                  <div key={order.id || idx} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start mb-3 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                            Đợt đặt hàng #{displayedOrders.length - idx}
                          </h3>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.72rem] font-bold border ${
                            isGeneral 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {isGeneral ? <ShoppingCart size={11} /> : <Package size={11} />}
                            {isGeneral ? 'Item Bán Hàng' : 'Consumable'}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.72rem] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            <User size={11} />
                            {orderCreator}
                          </span>
                        </div>
                        <p className="text-[0.72rem] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{formatDate(order.createdAt)}</span>
                          <span>•</span>
                          <span>Người tạo: <strong className="text-slate-700 font-semibold">{orderCreator}</strong></span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {/* Nút Xuất ảnh phiếu đặt hàng */}
                        <button 
                          type="button"
                          onClick={() => setExportOrder({ order, number: displayedOrders.length - idx })} 
                          title="Xuất phiếu dạng ảnh để sao chép / gửi Zalo, tin nhắn"
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-xs"
                        >
                          <FileImage size={15} className="text-blue-600" />
                          <span>Xuất ảnh</span>
                        </button>

                        {isOwnerOrAdmin && (
                          <>
                            <button 
                              onClick={() => handleOpenEdit(order)} 
                              title="Chỉnh sửa đợt đặt hàng"
                              className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => order.id && handleDeleteOrder(order.id)} 
                              title="Xóa đợt đặt hàng"
                              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Records in order */}
                    <div className="space-y-1">
                      {order.records.map((record) => {
                        const recordCreator = record.creatorName || orderCreator;
                        return (
                          <div key={record.id} className="flex justify-between items-center text-[0.82rem] py-2 border-b border-slate-50 last:border-0">
                            <div className="min-w-0 flex-1 pr-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-slate-400 text-[0.72rem] shrink-0 font-semibold">{record.id}</span>
                                <span className="font-semibold text-slate-800 truncate">{record.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[0.7rem] text-slate-500">
                                <User size={10} className="text-blue-500 shrink-0" />
                                <span>Người tạo: <strong className="text-slate-700 font-medium">{recordCreator}</strong></span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-extrabold text-slate-900 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg text-xs">
                                SL: {record.quantity}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Order summary footer */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-slate-500">
                      <div className="flex items-center gap-2.5">
                        <span>Tổng mặt hàng: <strong className="text-slate-700 font-semibold">{order.records.length}</strong> loại</span>
                        <span>•</span>
                        <span>Tổng số lượng đặt: <strong className="text-blue-600 font-bold text-xs">{totalQuantity}</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExportOrder({ order, number: displayedOrders.length - idx })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Share2 size={13} className="text-blue-500" />
                        <span>Chia sẻ / Xuất ảnh</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Floating Save Button */}
      <AnimatePresence>
        {activeTab === 'order' && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-6 left-0 right-0 px-6 z-40 pointer-events-none flex justify-center"
          >
            <button 
              onClick={handleSaveOrder}
              disabled={isSaving}
              className={`pointer-events-auto w-full max-w-sm py-4 text-white font-bold rounded-2xl shadow-2xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 cursor-pointer ${
                orderMode === 'consumable' 
                  ? 'bg-slate-900 shadow-slate-900/40' 
                  : 'bg-emerald-900 shadow-emerald-900/40'
              }`}
            >
              {isSaving ? 'Đang lưu...' : (
                <>
                  <Save size={20} /> 
                  Lưu danh sách {orderMode === 'consumable' ? 'Consumable' : 'Hàng khác'}
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EDIT MODAL: SỬA ĐỢT ĐẶT HÀNG ĐÃ LƯU */}
      <AnimatePresence>
        {editingOrder && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setEditingOrder(null)}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-3 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    Sửa Đợt đặt hàng {editingOrder.orderType === 'general' ? '(Item Bán Hàng)' : '(Consumable)'}
                  </h2>
                  <p className="text-[0.72rem] text-slate-500 font-medium">Món đã đặt được ưu tiên đưa lên đầu danh sách</p>
                </div>
                <button 
                  onClick={() => setEditingOrder(null)}
                  className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search Bar for Edit Modal */}
              <div className="mb-3 shrink-0 relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={editSearchTerm}
                  onChange={(e) => setEditSearchTerm(e.target.value)}
                  placeholder="Tìm tên món hoặc mã để sửa/thêm..."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
                {editSearchTerm && (
                  <button 
                    onClick={() => setEditSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 pb-4">
                {editModalCatalog.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium">
                    Không tìm thấy món nào với từ khóa "{editSearchTerm}"
                  </div>
                ) : (
                  editModalCatalog.map((item) => {
                    const currentQty = editQuantities[item.key];
                    const isOrdered = Boolean(currentQty && parseInt(currentQty) > 0);

                    return (
                      <div 
                        key={item.key} 
                        className={`grid grid-cols-12 gap-2 items-center p-2 rounded-xl transition-colors ${
                          isOrdered ? 'bg-blue-50/70 border border-blue-100' : 'border-b border-slate-50 last:border-0 hover:bg-slate-50/80'
                        }`}
                      >
                        <div className="col-span-3 text-[0.72rem] font-mono font-bold text-slate-500 truncate">
                          {item.barcode || item.sku}
                        </div>
                        <div className="col-span-6 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[0.8rem] font-semibold text-slate-800 leading-tight">
                              {item.name}
                            </span>
                            {isOrdered && (
                              <span className="inline-block px-1.5 py-0.2 rounded text-[0.62rem] font-extrabold bg-blue-600 text-white tracking-wide">
                                Đã đặt
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <input 
                            type="number" 
                            inputMode="numeric" 
                            pattern="[0-9]*" 
                            min="0"
                            placeholder="0"
                            value={editQuantities[item.key] || ''}
                            onChange={(e) => setEditQuantities(prev => ({...prev, [item.key]: e.target.value}))}
                            className={`w-full border rounded-lg px-2 py-1.5 text-center text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all ${
                              isOrdered 
                                ? 'bg-white border-blue-300 text-blue-700 shadow-sm font-extrabold' 
                                : 'bg-slate-100 border border-slate-200 text-slate-800 focus:bg-white'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-4 shrink-0 flex gap-3">
                 <button 
                    onClick={() => setEditingOrder(null)}
                    className="flex-1 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl active:scale-95 transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleSaveEdit}
                    className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    Lưu cập nhật
                  </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD ITEM MODAL: TẠO MỚI SẢN PHẨM ĐẶT HÀNG */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => setIsAddModalOpen(false)}
            />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 shadow-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                    orderMode === 'consumable' ? 'bg-blue-600' : 'bg-emerald-600'
                  }`}>
                    <Plus size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">
                      Tạo mới {orderMode === 'consumable' ? 'vật tư Consumable' : 'Item Bán Hàng'}
                    </h2>
                    <p className="text-[0.72rem] text-slate-400">
                      Lưu vào CSDL {orderMode === 'consumable' ? 'Item Đặt Hàng' : 'Item Bán Hàng'} & điền số lượng
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsAddModalOpen(false)} 
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Barcode / Mã vạch (nếu có)
                  </label>
                  <input 
                    type="text" 
                    value={newItemBarcode}
                    onChange={e => setNewItemBarcode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono font-bold"
                    placeholder="VD: 8934567890123 (có thể để trống)"
                  />
                  <p className="text-[0.7rem] text-slate-400 mt-1">
                    Nếu để trống, hệ thống sẽ tự sinh mã quản lý cho món này.
                  </p>
                </div>

                {orderMode === 'general' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Mã nội bộ (Tùy chọn)
                    </label>
                    <input 
                      type="text" 
                      value={newItemInternalCode}
                      onChange={e => setNewItemInternalCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono font-bold"
                      placeholder="VD: 100234"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Tên hàng <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-semibold"
                    placeholder={orderMode === 'consumable' ? "VD: Nước lau kính, Ly nhựa 500ml..." : "VD: Sữa tươi Vinamilk 100% 1L..."}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Số lượng cần đặt (tùy chọn)
                  </label>
                  <input 
                    type="number" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    value={newItemQuantity}
                    onChange={e => setNewItemQuantity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-bold"
                    placeholder="VD: 5 (sẽ tự điền vào bảng đặt hàng)"
                  />
                  <p className="text-[0.7rem] text-slate-400 mt-1">
                    Điền số lượng để món được đánh dấu đặt ngay mà không cần tìm lại.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl active:scale-95 transition-all text-sm"
                >
                  Hủy
                </button>
                <button 
                  type="button"
                  onClick={handleAddNewItem}
                  className={`flex-1 py-3.5 text-white font-bold rounded-xl shadow-md active:scale-95 transition-all text-sm flex items-center justify-center gap-1.5 ${
                    orderMode === 'consumable'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/25'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/25'
                  }`}
                >
                  <Check size={16} /> Lưu & Đặt hàng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT ITEM MODAL: CHỈNH SỬA TÊN HOẶC BARCODE TRONG CSDL */}
      <AnimatePresence>
        {isEditItemModalOpen && editingItem && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => {
                setIsEditItemModalOpen(false);
                setEditingItem(null);
              }}
            />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 shadow-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <Edit2 size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">
                      Chỉnh sửa {editingItem.isGeneral ? 'Item Bán Hàng' : 'Consumable'}
                    </h2>
                    <p className="text-[0.72rem] text-slate-400">
                      Cập nhật trực tiếp vào CSDL {editingItem.isGeneral ? 'Item Bán Hàng' : 'Item Đặt Hàng'}
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    setIsEditItemModalOpen(false);
                    setEditingItem(null);
                  }} 
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Barcode / Mã sản phẩm
                  </label>
                  <input 
                    type="text" 
                    value={editItemBarcode}
                    onChange={e => setEditItemBarcode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono font-bold"
                    placeholder="VD: 8934567890123"
                  />
                </div>

                {editingItem.isGeneral && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Mã nội bộ
                    </label>
                    <input 
                      type="text" 
                      value={editItemInternalCode}
                      onChange={e => setEditItemInternalCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono font-bold"
                      placeholder="VD: 100234"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Tên hàng <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={editItemName}
                    onChange={e => setEditItemName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-semibold"
                    placeholder="Tên sản phẩm..."
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditItemModalOpen(false);
                      setEditingItem(null);
                    }}
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl active:scale-95 transition-all text-sm"
                  >
                    Hủy
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveEditItem}
                    className="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/25 active:scale-95 transition-all text-sm flex items-center justify-center gap-1.5"
                  >
                    <Check size={16} /> Lưu thay đổi
                  </button>
                </div>

                <button 
                  type="button"
                  onClick={() => handleDeleteItem(editingItem)}
                  className="w-full py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={14} /> Xóa mặt hàng này khỏi CSDL
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL XUẤT ẢNH PHIẾU ĐẶT HÀNG & SAO CHÉP */}
      <OrderImageModal
        isOpen={Boolean(exportOrder)}
        onClose={() => setExportOrder(null)}
        order={exportOrder?.order || null}
        orderNumber={exportOrder?.number || 1}
      />

    </motion.div>
  );
};

export default InventoryScreen;
