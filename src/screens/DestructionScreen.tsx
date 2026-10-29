import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  X, 
  RotateCcw, 
  CheckCircle2, 
  FileSpreadsheet, 
  ClipboardList, 
  Plus, 
  Minus, 
  Copy, 
  Check, 
  Filter,
  ArrowUpDown,
  FileDown
} from 'lucide-react';
import { Header, EmptyState } from '../components/SharedUI';
import { 
  DestructionItem, 
  subscribeDestructionItems, 
  getStoredTempQuantities, 
  saveStoredTempQuantities,
  getStoredTempNotes,
  saveStoredTempNotes,
  clearStoredTempQuantities
} from '../lib/destructionService';
import * as XLSX from 'xlsx';

interface DestructionScreenProps {
  onBack: () => void;
  onNavigateToData?: () => void;
}

export const DestructionScreen: React.FC<DestructionScreenProps> = ({ 
  onBack,
  onNavigateToData
}) => {
  const [items, setItems] = useState<DestructionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'entered' | 'pending'>('all');
  
  // Lưu số lượng nhập tạm thời theo ID của item
  const [tempQuantities, setTempQuantities] = useState<Record<string, number>>({});
  // Lưu ghi chú nhập tạm thời
  const [tempNotes, setTempNotes] = useState<Record<string, string>>({});
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Khởi tạo và lắng nghe dữ liệu từ Firestore
  useEffect(() => {
    // Tải số lượng và ghi chú đã lưu tạm trong localStorage
    const savedQtys = getStoredTempQuantities();
    const savedNotes = getStoredTempNotes();
    setTempQuantities(savedQtys);
    setTempNotes(savedNotes);

    const unsubscribe = subscribeDestructionItems(
      (data) => {
        setItems(data);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching destruction items:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Xử lý thay đổi số lượng hủy tạm thời
  const handleQuantityChange = (itemId: string, value: string) => {
    const newQtys = { ...tempQuantities };
    if (value === '' || isNaN(Number(value))) {
      delete newQtys[itemId];
    } else {
      const num = Math.max(0, parseInt(value, 10));
      if (num === 0 && value === '0') {
        newQtys[itemId] = 0;
      } else if (num > 0) {
        newQtys[itemId] = num;
      } else {
        delete newQtys[itemId];
      }
    }
    setTempQuantities(newQtys);
    saveStoredTempQuantities(newQtys);
  };

  // Nút tăng/giảm số lượng nhanh (+/-)
  const handleStepQuantity = (itemId: string, delta: number) => {
    const current = tempQuantities[itemId] || 0;
    const nextVal = Math.max(0, current + delta);
    const newQtys = { ...tempQuantities };
    if (nextVal > 0) {
      newQtys[itemId] = nextVal;
    } else {
      delete newQtys[itemId];
    }
    setTempQuantities(newQtys);
    saveStoredTempQuantities(newQtys);
  };

  // Xử lý sửa ghi chú
  const handleNoteChange = (itemId: string, noteVal: string) => {
    const newNotes = { ...tempNotes };
    if (noteVal.trim() === '') {
      delete newNotes[itemId];
    } else {
      newNotes[itemId] = noteVal;
    }
    setTempNotes(newNotes);
    saveStoredTempNotes(newNotes);
  };

  // Đặt lại toàn bộ số lượng đã nhập
  const handleConfirmReset = () => {
    setTempQuantities({});
    clearStoredTempQuantities();
    setIsResetConfirmOpen(false);
  };

  // Copy mã vào clipboard
  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Xuất nhanh danh sách đối chiếu ra file CSV chuẩn UTF-8 có BOM
  const handleExportReconciliation = () => {
    if (items.length === 0) return;
    let csvContent = 'STT,Mã nội bộ,Barcode,Tên hàng,Số lượng hủy đối chiếu,Số lượng gốc,Ghi chú\r\n';
    items.forEach((it, idx) => {
      const qtyEntered = tempQuantities[it.id] ?? '';
      const finalNote = tempNotes[it.id] ?? (it.note || '');
      const stt = it.stt ?? (idx + 1);
      const internalCode = (it.internalCode || '').replace(/"/g, '""');
      const barcode = (it.barcode || '').replace(/"/g, '""');
      const name = (it.name || '').replace(/"/g, '""');
      const note = (finalNote || '').replace(/"/g, '""');
      csvContent += `"${stt}","${internalCode}","${barcode}","${name}","${qtyEntered}","${it.quantity ?? ''}","${note}"\r\n`;
    });

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Bien_Ban_Huy_Doi_Chieu_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Lọc và tìm kiếm
  const searchLower = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Bộ lọc trạng thái nhập
      const hasQty = tempQuantities[item.id] !== undefined && tempQuantities[item.id] > 0;
      if (filterMode === 'entered' && !hasQty) return false;
      if (filterMode === 'pending' && hasQty) return false;

      // Tìm kiếm theo nhiều trường
      if (!searchLower) return true;

      const sttStr = String(item.stt || '').toLowerCase();
      if (sttStr === searchLower || sttStr.startsWith(searchLower)) return true;

      if (item.name.toLowerCase().includes(searchLower)) return true;
      if (item.barcode.toLowerCase().includes(searchLower)) return true;
      if (item.internalCode && item.internalCode.toLowerCase().includes(searchLower)) return true;
      if (item.note && item.note.toLowerCase().includes(searchLower)) return true;

      return false;
    });
  }, [items, searchLower, filterMode, tempQuantities]);

  // Thống kê tổng quan
  const enteredCount = useMemo(() => {
    return Object.keys(tempQuantities).filter(k => tempQuantities[k] > 0).length;
  }, [tempQuantities]);

  const totalQuantitySum = useMemo(() => {
    return (Object.values(tempQuantities) as number[]).reduce((sum: number, val: number) => sum + (val || 0), 0);
  }, [tempQuantities]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col min-h-screen"
    >
      <Header 
        title="BIÊN BẢN HỦY HÀNG" 
        onBack={onBack}
        rightElement={
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportReconciliation}
              className="p-2 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all"
              title="Xuất file CSV đối chiếu"
            >
              <FileDown size={20} />
            </button>
            <button
              onClick={() => setIsResetConfirmOpen(true)}
              disabled={enteredCount === 0}
              className={`p-2 rounded-xl transition-all ${enteredCount > 0 ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-300 cursor-not-allowed'}`}
              title="Đặt lại số lượng nhập"
            >
              <RotateCcw size={20} />
            </button>
          </div>
        }
      />

      {/* Thanh tìm kiếm & thống kê cố định */}
      <div className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur-md pt-1 pb-3 space-y-2.5">
        <div className="relative shadow-sm rounded-2xl overflow-hidden bg-white border border-slate-200/90 focus-within:border-rose-500 focus-within:ring-4 focus-within:ring-rose-500/10 transition-all">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
          <input
            type="text"
            className="w-full pl-10 pr-10 py-3.5 bg-transparent outline-none text-[0.92rem] font-medium text-slate-800 placeholder:text-slate-400"
            placeholder="Tìm theo STT giấy, Mã nội bộ, Barcode, Tên hàng..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Thống kê nhanh và các chip lọc */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterMode === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              Tất cả ({items.length})
            </button>
            <button
              onClick={() => setFilterMode('entered')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${filterMode === 'entered' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'}`}
            >
              <CheckCircle2 size={13} />
              Đã nhập ({enteredCount})
            </button>
            <button
              onClick={() => setFilterMode('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterMode === 'pending' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'}`}
            >
              Chưa nhập ({items.length - enteredCount})
            </button>
          </div>

          <div className="shrink-0 flex items-center gap-2 text-xs font-bold bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-slate-500">Tổng SL hủy:</span>
            <span className="text-rose-600 font-mono text-sm">{totalQuantitySum}</span>
          </div>
        </div>
      </div>

      {/* Bảng danh sách hàng đối chiếu (STT, Mã nội bộ / Barcode, Tên hàng, Số lượng, Ghi chú) */}
      <div className="flex-1 pb-24">
        {loading ? (
          <div className="py-20 text-center">
            <div className="inline-block w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-slate-500 mt-3">Đang tải biên bản hủy...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 bg-white rounded-2xl border border-slate-200/80 p-6 text-center mt-2 shadow-sm">
            <ClipboardList className="mx-auto text-slate-300 mb-3" size={48} />
            <div className="font-bold text-slate-700 text-base mb-1">
              {search ? 'Không tìm thấy mặt hàng phù hợp' : 'Chưa có mặt hàng trong biên bản hủy'}
            </div>
            <p className="text-xs text-slate-400 mb-4 max-w-xs mx-auto">
              {search ? 'Hãy thử tìm bằng từ khóa khác hoặc mã số khác' : 'Bạn có thể vào tab Dữ liệu để nạp file Excel biên bản hủy'}
            </p>
            {onNavigateToData && (
              <button
                onClick={onNavigateToData}
                className="px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-rose-500/20"
              >
                Mở tab Dữ liệu để nạp file
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            {/* Header bảng chuẩn */}
            <div className="grid grid-cols-12 gap-1.5 px-3 py-3 bg-slate-50/90 border-b border-slate-200 text-[0.72rem] font-extrabold uppercase tracking-wider text-slate-500">
              <div className="col-span-2 sm:col-span-1 text-center">STT</div>
              <div className="col-span-4 sm:col-span-3">Mã / Barcode</div>
              <div className="col-span-6 sm:col-span-4">Tên hàng</div>
              <div className="hidden sm:block sm:col-span-2 text-center">Số lượng hủy</div>
              <div className="hidden sm:block sm:col-span-2">Ghi chú</div>
            </div>

            {/* Các dòng dữ liệu */}
            <div className="divide-y divide-slate-100">
              {filteredItems.map((item, index) => {
                const currentQty = tempQuantities[item.id];
                const isEntered = currentQty !== undefined && currentQty > 0;
                const currentNote = tempNotes[item.id] !== undefined ? tempNotes[item.id] : (item.note || '');

                return (
                  <div 
                    key={item.id}
                    className={`transition-colors p-3 ${isEntered ? 'bg-emerald-50/40 hover:bg-emerald-50/70' : 'hover:bg-slate-50/80'}`}
                  >
                    {/* Bố cục responsive: trên desktop hiển thị chuẩn cột, trên mobile hiển thị gọn gàng nhưng vẫn giữ đúng cấu trúc cột */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      {/* Cột STT: Rất quan trọng để đối chiếu theo số dòng in trên biên bản giấy */}
                      <div className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center">
                        <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-lg font-mono font-black text-xs ${
                          isEntered 
                            ? 'bg-emerald-600 text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-700 border border-slate-200/80'
                        }`}>
                          {item.stt ?? (index + 1)}
                        </span>
                      </div>

                      {/* Cột Mã nội bộ / Barcode */}
                      <div className="col-span-4 sm:col-span-3 min-w-0 pr-1">
                        {item.internalCode && (
                          <div className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-md font-mono text-[0.72rem] font-bold border border-indigo-100 mb-0.5">
                            <span>#{item.internalCode}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 font-mono text-[0.75rem] text-slate-600 tracking-tight truncate">
                          <span className="truncate">{item.barcode}</span>
                          <button
                            onClick={() => handleCopyCode(item.barcode, item.id)}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded shrink-0 transition-colors"
                            title="Sao chép barcode"
                          >
                            {copiedId === item.id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>

                      {/* Cột Tên hàng */}
                      <div className="col-span-6 sm:col-span-4">
                        <div className="font-bold text-slate-800 text-[0.88rem] leading-snug line-clamp-2">
                          {item.name}
                        </div>
                        {/* Hiển thị số lượng gốc nếu có */}
                        {item.quantity !== undefined && (
                          <div className="text-[0.7rem] text-slate-400 mt-0.5">
                            SL trên phiếu: <span className="font-semibold text-slate-600">{item.quantity}</span>
                          </div>
                        )}
                      </div>

                      {/* Cột Số lượng (Hiển thị inline trên sm+, và hàng phụ trên mobile) */}
                      <div className="hidden sm:flex sm:col-span-2 items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStepQuantity(item.id, -1)}
                          disabled={!currentQty}
                          className="w-7 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-all cursor-pointer shrink-0"
                        >
                          <Minus size={13} />
                        </button>
                        
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          min="0"
                          value={currentQty ?? ''}
                          placeholder="0"
                          onChange={e => handleQuantityChange(item.id, e.target.value)}
                          className={`w-14 h-8 text-center font-bold font-mono rounded-lg border outline-none text-sm transition-all ${
                            isEntered 
                              ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs' 
                              : 'bg-white text-slate-800 border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() => handleStepQuantity(item.id, 1)}
                          className="w-7 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-all cursor-pointer shrink-0"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      {/* Cột Ghi chú trên sm+ */}
                      <div className="hidden sm:block sm:col-span-2">
                        <input
                          type="text"
                          value={currentNote}
                          placeholder="Thêm ghi chú..."
                          onChange={e => handleNoteChange(item.id, e.target.value)}
                          className="w-full px-2 py-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-rose-400 transition-all placeholder:text-slate-300"
                        />
                      </div>
                    </div>

                    {/* Dòng thao tác nhập nhanh trên thiết bị di động (Mobile View) */}
                    <div className="sm:hidden mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.72rem] font-bold text-slate-500">SL Hủy:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStepQuantity(item.id, -1)}
                            disabled={!currentQty}
                            className="w-7 h-7 rounded-lg bg-slate-100 active:bg-slate-200 disabled:opacity-30 text-slate-600 flex items-center justify-center"
                          >
                            <Minus size={12} />
                          </button>
                          
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="0"
                            value={currentQty ?? ''}
                            placeholder="0"
                            onChange={e => handleQuantityChange(item.id, e.target.value)}
                            className={`w-14 h-7 text-center font-bold font-mono rounded-lg border outline-none text-xs transition-all ${
                              isEntered 
                                ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs' 
                                : 'bg-white text-slate-800 border-slate-300 focus:border-rose-500'
                            }`}
                          />

                          <button
                            type="button"
                            onClick={() => handleStepQuantity(item.id, 1)}
                            className="w-7 h-7 rounded-lg bg-rose-50 active:bg-rose-100 text-rose-600 flex items-center justify-center"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 max-w-[180px]">
                        <input
                          type="text"
                          value={currentNote}
                          placeholder="Ghi chú..."
                          onChange={e => handleNoteChange(item.id, e.target.value)}
                          className="w-full px-2 py-1 text-[0.72rem] text-slate-700 bg-slate-50 border border-slate-200 rounded-md outline-none focus:bg-white focus:border-rose-400 placeholder:text-slate-300"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal xác nhận đặt lại (Reset) các số lượng đã nhập */}
      <AnimatePresence>
        {isResetConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => setIsResetConfirmOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl z-10 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <RotateCcw size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1.5">
                Đặt lại số lượng nhập?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-5">
                Thao tác này sẽ xóa toàn bộ các số lượng hủy bạn vừa nhập tạm thời để bắt đầu đợt đối chiếu mới. Danh sách các mặt hàng gốc vẫn được giữ nguyên.
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all"
                >
                  Giữ lại
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-500/25 transition-all"
                >
                  Xác nhận xóa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
