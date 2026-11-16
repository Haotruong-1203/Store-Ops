import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Header, 
  Card 
} from '../components/SharedUI';
import { stopAllCameraMediaTracks } from '../hooks/useBarcodeScanner';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { 
  fetchDisposalTemplates, 
  fetchDisposalRecords, 
  fetchDisposalRecordItems, 
  fetchAllDisposalRecordItems,
  deduplicateItemsList,
  saveDisposalRecordOnline, 
  deleteDisposalRecordOnline,
  deleteAllDisposalRecordsOnline,
  mergeAllDisposalRecordsOnline,
  formatBarcodeDisplay,
  resolveDisposalProductByCode,
  searchDisposalSuggestions,
  ResolvedDisposalProduct,
  DisposalTemplateItem,
  DisposalRecord,
  DisposalRecordItem
} from '../lib/disposalService';
import { generateDisposalImage, GeneratedDisposalImage } from '../utils/disposalReceiptGenerator';
import { Product } from '../lib/firestoreService';
import { 
  Camera, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Check, 
  Copy, 
  PackageX, 
  PackageCheck, 
  X, 
  FileText,
  Barcode as BarcodeIcon,
  Download,
  Loader2,
  RefreshCw,
  Layers
} from 'lucide-react';

interface DisposalScreenProps {
  onBack: () => void;
  products?: Product[];
}

export const DisposalScreen: React.FC<DisposalScreenProps> = ({ onBack, products = [] }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'saved'>('create');
  const [templates, setTemplates] = useState<DisposalTemplateItem[]>([]);
  const [records, setRecords] = useState<DisposalRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [tempItems, setTempItems] = useState<DisposalRecordItem[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<{
    name: string;
    barcode: string;
    internal_code?: string | null;
    form_stt?: number | null;
  } | null>(null);
  const [currentQty, setCurrentQty] = useState<number>(1);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState<boolean>(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<ResolvedDisposalProduct[]>([]);
  const [isSearchingInput, setIsSearchingInput] = useState<boolean>(false);
  const [isResolvingManual, setIsResolvingManual] = useState<boolean>(false);
  const searchRequestIdRef = useRef<number>(0);

  const [recordItemsMap, setRecordItemsMap] = useState<Record<string, DisposalRecordItem[]>>({});
  const [recordToDelete, setRecordToDelete] = useState<{ id: string; batchNumber: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [exportModalData, setExportModalData] = useState<{
    number: number;
    record: DisposalRecord;
    items: DisposalRecordItem[];
    imageData?: GeneratedDisposalImage;
  } | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [copiedImageToast, setCopiedImageToast] = useState(false);

  const loadSavedRecords = async () => {
    setLoadingRecords(true);
    try {
      const [recs, allItems] = await Promise.all([
        fetchDisposalRecords(),
        fetchAllDisposalRecordItems()
      ]);
      setRecords(recs);
      setRecordItemsMap(allItems);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    fetchDisposalTemplates().then(setTemplates);
    loadSavedRecords();
  }, []);

  useEffect(() => {
    return () => {
      stopAllCameraMediaTracks();
    };
  }, []);

  useEffect(() => {
    const term = searchInput.trim();
    if (!term || term.length < 2 || selectedProduct) {
      setRemoteSuggestions([]);
      setIsSearchingInput(false);
      return;
    }

    const reqId = ++searchRequestIdRef.current;
    setIsSearchingInput(true);

    const timer = setTimeout(async () => {
      try {
        const list = await searchDisposalSuggestions(term, templates, products);
        if (searchRequestIdRef.current === reqId) {
          setRemoteSuggestions(list);
        }
      } catch {
        if (searchRequestIdRef.current === reqId) {
          setRemoteSuggestions([]);
        }
      } finally {
        if (searchRequestIdRef.current === reqId) {
          setIsSearchingInput(false);
        }
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [searchInput, selectedProduct, templates, products]);

  const searchSuggestions = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    if (!term || term.length < 2 || selectedProduct) return [];

    const merged: ResolvedDisposalProduct[] = [];
    const seen = new Set<string>();

    templates.forEach(t => {
      if (t.barcode.toLowerCase().includes(term) || t.name.toLowerCase().includes(term)) {
        const key = t.barcode.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          seen.add(t.name.trim().toLowerCase());
          merged.push({
            name: t.name,
            barcode: t.barcode,
            internal_code: t.barcode,
            form_stt: t.stt,
            source: 'template'
          });
        }
      }
    });

    remoteSuggestions.forEach(item => {
      const codeKey = (item.internal_code || item.barcode || item.name).trim().toLowerCase();
      const nameKey = item.name.trim().toLowerCase();
      if (!seen.has(codeKey) && !seen.has(nameKey)) {
        seen.add(codeKey);
        seen.add(nameKey);
        merged.push(item);
      }
    });

    return merged.slice(0, 12);
  }, [searchInput, selectedProduct, templates, remoteSuggestions]);

  const handleSelectSuggestion = (s: {
    name: string;
    barcode: string;
    internal_code?: string | null;
    form_stt?: number | null;
  }) => {
    setSelectedProduct(s);
    setSearchInput(s.name);
    setRemoteSuggestions([]);
  };

  const handleDisposalProductFound = useCallback((resolved: ResolvedDisposalProduct) => {
    setSelectedProduct(resolved);
    setSearchInput(resolved.name);
    setRemoteSuggestions([]);
    setIsScannerModalOpen(false);
  }, []);

  const handleResolveManualInput = async () => {
    const term = searchInput.trim();
    if (!term || isResolvingManual) return;
    setIsResolvingManual(true);
    try {
      const resolved = await resolveDisposalProductByCode(term, templates, products, true);
      if (resolved) {
        setSelectedProduct(resolved);
        setSearchInput(resolved.name);
        setRemoteSuggestions([]);
      }
    } finally {
      setIsResolvingManual(false);
    }
  };

  const handleAddToTemp = async () => {
    if ((!selectedProduct && !searchInput.trim()) || isResolvingManual) return;

    let prod = selectedProduct;
    if (!prod) {
      setIsResolvingManual(true);
      try {
        const resolved = await resolveDisposalProductByCode(searchInput, templates, products, true);
        prod = resolved || {
          name: searchInput.trim(),
          barcode: searchInput.trim(),
          internal_code: null,
          form_stt: null
        };
      } finally {
        setIsResolvingManual(false);
      }
    }

    const addQty = Math.max(1, currentQty);

    setTempItems(prev => {
      const matchIndex = prev.findIndex(item => {
        if (item.internal_code && prod!.internal_code) {
          return item.internal_code === prod!.internal_code;
        }
        return item.barcode === prod!.barcode || (item.product_name.toLowerCase() === prod!.name.toLowerCase());
      });

      if (matchIndex >= 0) {
        const next = [...prev];
        next[matchIndex] = {
          ...next[matchIndex],
          quantity: next[matchIndex].quantity + addQty
        };
        return next;
      }

      return [
        ...prev,
        {
          product_name: prod!.name,
          internal_code: prod!.internal_code || null,
          barcode: prod!.barcode,
          quantity: addQty,
          form_stt: prod!.form_stt !== undefined ? prod!.form_stt : null
        }
      ];
    });

    setSelectedProduct(null);
    setSearchInput('');
    setRemoteSuggestions([]);
    setCurrentQty(1);
  };

  const handleUpdateTempQty = (index: number, delta: number) => {
    setTempItems(prev => {
      const next = [...prev];
      const target = next[index];
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        return next.filter((_, i) => i !== index);
      }
      next[index] = { ...target, quantity: newQty };
      return next;
    });
  };

  const handleRemoveTempItem = (index: number) => {
    setTempItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveBatch = async () => {
    if (tempItems.length === 0 || isSaving) return;

    setIsSaving(true);
    try {
      const saved = await saveDisposalRecordOnline(tempItems);
      setRecords(prev => [saved, ...prev.filter(r => r.id !== saved.id)]);
      setRecordItemsMap(prev => ({
        ...prev,
        [saved.id]: tempItems
      }));
      setTempItems([]);
      setActiveTab('saved');
      loadSavedRecords();
    } catch (err: any) {
      console.error(err);
      alert('Không thể lưu đợt hủy hàng: ' + (err.message || 'Lỗi kết nối'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!recordToDelete || isDeleting) return;
    const targetId = recordToDelete.id;
    setIsDeleting(true);
    try {
      await deleteDisposalRecordOnline(targetId);
      setRecords(prev => prev.filter(r => r.id !== targetId));
      setRecordItemsMap(prev => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      setRecordToDelete(null);
    } catch (err: any) {
      console.error(err);
      setRecords(prev => prev.filter(r => r.id !== targetId));
      setRecordToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMergeAllRecords = async () => {
    if (records.length < 2 || isMerging) return;
    setIsMerging(true);
    try {
      const res = await mergeAllDisposalRecordsOnline(records, recordItemsMap);
      if (res) {
        setRecords([res.record]);
        setRecordItemsMap({ [res.record.id]: res.items });
      }
      await loadSavedRecords();
    } catch (err) {
      console.error(err);
    } finally {
      setIsMerging(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (isDeletingAll) return;
    setIsDeletingAll(true);
    try {
      const ids = records.map(r => r.id);
      await deleteAllDisposalRecordsOnline(ids);
      setRecords([]);
      setRecordItemsMap({});
      setIsDeleteAllModalOpen(false);
    } catch (err) {
      console.error(err);
      setRecords([]);
      setRecordItemsMap({});
      setIsDeleteAllModalOpen(false);
    } finally {
      setIsDeletingAll(false);
    }
  };

  const getSortedRecordItems = (items: DisposalRecordItem[]) => {
    const clean = deduplicateItemsList(items || []);
    return [...clean].sort((a, b) => {
      const sttA = (a.form_stt !== null && a.form_stt !== undefined) ? a.form_stt : 999999;
      const sttB = (b.form_stt !== null && b.form_stt !== undefined) ? b.form_stt : 999999;
      if (sttA !== sttB) {
        return sttA - sttB;
      }
      return a.product_name.localeCompare(b.product_name, 'vi');
    });
  };

  const handleOpenExportModal = async (number: number, record: DisposalRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    let items = recordItemsMap[record.id];
    if (!items || items.length === 0) {
      items = await fetchDisposalRecordItems(record.id);
      setRecordItemsMap(prev => ({ ...prev, [record.id]: items }));
    }

    const sorted = getSortedRecordItems(items || []);
    setIsGeneratingImage(true);
    setExportModalData({
      number,
      record,
      items: sorted
    });

    try {
      const img = await generateDisposalImage(number, record, sorted);
      setExportModalData({
        number,
        record,
        items: sorted,
        imageData: img
      });
    } catch (err) {
      console.error(err);
      alert('Không thể xuất ảnh phiếu hủy.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleDownloadImage = () => {
    if (!exportModalData?.imageData) return;
    const a = document.createElement('a');
    a.href = exportModalData.imageData.dataUrl;
    a.download = `BienBanHuyHang_Dot_${exportModalData.number}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyImageToClipboard = async () => {
    if (!exportModalData?.imageData) return;
    try {
      if ((window as any).ClipboardItem && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({
            'image/png': exportModalData.imageData.blob
          })
        ]);
        setCopiedImageToast(true);
        setTimeout(() => setCopiedImageToast(false), 2000);
      } else {
        handleDownloadImage();
      }
    } catch {
      handleDownloadImage();
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) + ' ' + d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const [nowClock, setNowClock] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowClock(new Date());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const shortDay = String(nowClock.getDate()).padStart(2, '0');
  const shortHour = String(nowClock.getHours()).padStart(2, '0');

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full bg-transparent min-h-dvh pb-20 relative"
    >
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-xl pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 transition-all border-b border-slate-200/60 shadow-xs mb-4">
        <div className="max-w-4xl lg:max-w-5xl mx-auto w-full">
          <Header 
            title="HUỶ HÀNG" 
            className="!mb-2 shadow-apple-soft"
            onBack={() => {
              setIsScannerModalOpen(false);
              stopAllCameraMediaTracks();
              onBack();
            }}
            rightElement={
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100/90 text-slate-700 text-xs font-extrabold font-mono tracking-tight border-0">
                <span className="text-rose-600">Ngày {shortDay}</span>
                <span className="text-slate-300">•</span>
                <span>{shortHour}h</span>
              </div>
            }
          />

          <div className="flex p-1.5 bg-slate-200/60 backdrop-blur-md rounded-full shadow-apple-soft border-0 w-full">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`flex-1 py-2.5 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border-0 ${
                activeTab === 'create'
                  ? 'bg-[#e11d48] text-white shadow-apple-soft'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PackageX size={15} />
              <span>Nhập</span>
              {tempItems.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-white text-[0.65rem]">
                  {tempItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('saved');
                loadSavedRecords();
              }}
              className={`flex-1 py-2.5 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border-0 ${
                activeTab === 'saved'
                  ? 'bg-[#e11d48] text-white shadow-apple-soft'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText size={15} />
              <span>Đã lưu</span>
              <span className={`px-2 py-0.5 rounded-full text-[0.7rem] font-bold ${
                activeTab === 'saved' ? 'bg-white/25 text-white' : 'bg-slate-300 text-slate-800'
              }`}>
                {records.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 max-w-4xl lg:max-w-5xl mx-auto w-full">
        {activeTab === 'create' && (
          <div className="space-y-3.5">
            <Card className="!p-3.5 sm:!p-5 space-y-3.5 sm:space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 truncate">
                  Nhập hoặc quét
                </span>
                <button
                  type="button"
                  onClick={() => setIsScannerModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer border-0 shadow-apple-soft active:scale-95 shrink-0 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                >
                  <Camera size={17} />
                  <span>Bật camera</span>
                </button>
              </div>

              <div className="relative">
                <div className="relative flex items-center">
                  <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      setSelectedProduct(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleResolveManualInput();
                      }
                    }}
                    placeholder="Nhập mã vạch, mã nội bộ hoặc tên..."
                    className="w-full bg-slate-100/90 border-0 rounded-xl sm:rounded-2xl pl-9 pr-9 py-2.5 sm:py-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 transition-all font-medium"
                  />
                  {isSearchingInput ? (
                    <Loader2 size={15} className="absolute right-2.5 text-rose-500 animate-spin pointer-events-none" />
                  ) : searchInput ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setSelectedProduct(null);
                        setRemoteSuggestions([]);
                      }}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  ) : null}
                </div>

                {searchSuggestions.length > 0 && !selectedProduct && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-apple-lg border border-slate-100 overflow-hidden z-30 max-h-56 overflow-y-auto">
                    {searchSuggestions.map((s, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectSuggestion(s)}
                        className="px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                          <p className="text-[0.7rem] text-slate-400 font-mono">
                            {formatBarcodeDisplay(s.internal_code || s.barcode)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {s.form_stt !== null && s.form_stt !== undefined ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[0.68rem] font-bold">
                              STT: {s.form_stt}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[0.68rem]">
                              Ngoài danh mục
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedProduct && (
                <div className="p-2.5 sm:p-3 bg-rose-50/60 rounded-xl sm:rounded-2xl border border-rose-100 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{selectedProduct.name}</p>
                    <p className="text-[0.7rem] text-slate-500 font-mono mt-0.5">
                      {formatBarcodeDisplay(selectedProduct.internal_code || selectedProduct.barcode)}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                    selectedProduct.form_stt !== null && selectedProduct.form_stt !== undefined
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {selectedProduct.form_stt !== null && selectedProduct.form_stt !== undefined
                      ? `Vị trí: ${selectedProduct.form_stt}`
                      : 'Không có sẵn'}
                  </span>
                </div>
              )}

              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Số lượng huỷ
                </span>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center bg-slate-100 rounded-xl p-0.5 sm:p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCurrentQty(q => Math.max(1, q - 1))}
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white rounded-lg sm:rounded-xl text-slate-700 shadow-xs active:scale-95 cursor-pointer border-0"
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={currentQty}
                      onChange={(e) => setCurrentQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 sm:w-14 text-center bg-transparent border-0 font-bold text-sm sm:text-base text-slate-800 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCurrentQty(q => q + 1)}
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white rounded-lg sm:rounded-xl text-slate-700 shadow-xs active:scale-95 cursor-pointer border-0"
                    >
                      <Plus size={15} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {[1, 2, 5, 10].map(addVal => (
                      <button
                        key={addVal}
                        type="button"
                        onClick={() => setCurrentQty(addVal)}
                        className={`flex-1 py-1.5 sm:py-2 rounded-xl text-xs font-bold cursor-pointer transition-all border-0 text-center ${
                          currentQty === addVal 
                            ? 'bg-rose-600 text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {addVal}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleAddToTemp}
                  disabled={isResolvingManual || (!selectedProduct && !searchInput.trim())}
                  className="w-full py-2.5 sm:py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-xl sm:rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-apple-soft active:scale-[0.99] transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none border-0"
                >
                  {isResolvingManual ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  <span>{isResolvingManual ? 'Đang tìm sản phẩm...' : 'Thêm vào danh sách tạm'}</span>
                </button>
              </div>
            </Card>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Danh sách đợt hủy lần này
                  </h3>
                </div>
                {tempItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTempItems([])}
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 cursor-pointer"
                  >
                    Xóa hết
                  </button>
                )}
              </div>

              {tempItems.length === 0 ? (
                <div className="bg-white/70 backdrop-blur-md rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-center text-slate-400 space-y-1.5 border-0">
                  <PackageX size={32} className="mx-auto text-slate-300" strokeWidth={1.5} />
                  <p className="text-xs">Chưa có món nào trong rổ hàng huỷ.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tempItems.map((item, idx) => {
                    const code = formatBarcodeDisplay(item.internal_code || item.barcode);
                    const pos = (item.form_stt !== null && item.form_stt !== undefined)
                      ? `STT: ${item.form_stt}`
                      : 'Không có sẵn';

                    return (
                      <div
                        key={idx}
                        className="bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-apple-soft flex items-center justify-between gap-3 border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-800 truncate">{item.product_name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[0.72rem] text-slate-500 font-mono">
                              [{code}]
                            </span>
                            <span className={`text-[0.65rem] px-2 py-0.5 rounded-md font-bold ${
                              item.form_stt !== null && item.form_stt !== undefined
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              [{pos}]
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center bg-slate-100 rounded-xl p-0.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateTempQty(idx, -1)}
                              className="w-7 h-7 flex items-center justify-center bg-white rounded-lg text-slate-700 active:scale-95 cursor-pointer border-0 shadow-xs"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-8 text-center text-xs font-bold text-slate-800">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateTempQty(idx, 1)}
                              className="w-7 h-7 flex items-center justify-center bg-white rounded-lg text-slate-700 active:scale-95 cursor-pointer border-0 shadow-xs"
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveTempItem(idx)}
                            className="p-2 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSaveBatch}
                      disabled={isSaving}
                      className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-700 hover:to-orange-700 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-apple active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 border-0"
                    >
                      <PackageCheck size={18} />
                      <span>{isSaving ? 'Đang lưu...' : 'Lưu bản ghi'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 px-1 mb-1">
              <h3 className="text-sm font-bold text-slate-800 shrink-0">
                Đã lưu ({records.length})
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleMergeAllRecords}
                  disabled={records.length < 2 || isMerging || loadingRecords}
                  className="px-3 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:pointer-events-none border-0 shadow-2xs"
                >
                  {isMerging ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
                  <span>{isMerging ? 'Đang gộp...' : 'Gộp tất cả'}</span>
                </button>
                <button
                  type="button"
                  onClick={loadSavedRecords}
                  disabled={loadingRecords || isMerging}
                  title="Làm mới"
                  className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-50 border-0"
                >
                  <RefreshCw size={15} className={loadingRecords ? 'animate-spin text-rose-600' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeleteAllModalOpen(true)}
                  disabled={records.length === 0 || isDeletingAll || isMerging}
                  title="Xóa tất cả bản ghi"
                  className="w-8 h-8 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:pointer-events-none border-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {loadingRecords && records.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Đang tải danh sách bản ghi...
              </div>
            ) : records.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-md rounded-3xl p-8 text-center text-slate-400 space-y-2 border-0">
                <FileText size={36} className="mx-auto text-slate-300" strokeWidth={1.5} />
                <p className="text-xs">Chưa có đợt huỷ hàng nào được lưu.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 mt-2 bg-[#e11d48] text-white font-bold text-xs rounded-full shadow-apple-soft cursor-pointer"
                >
                  Tạo đợt huỷ mới
                </button>
              </div>
            ) : (
              records.map((rec, idx) => {
                const batchNumber = records.length - idx;
                const items = recordItemsMap[rec.id] || [];
                const sortedItems = getSortedRecordItems(items);
                const totalBatchQty = sortedItems.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);

                return (
                  <div
                    key={rec.id}
                    className="bg-white rounded-[1.75rem] p-4 shadow-apple-soft border border-slate-100/80 space-y-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                          Đợt {batchNumber}
                        </h3>
                        <p className="text-[0.72rem] text-slate-400 mt-0.5">
                          {formatDateTime(rec.created_at)} • {sortedItems.length} món • SL: {totalBatchQty}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleOpenExportModal(batchNumber, rec, e)}
                          className="px-3.5 py-1.5 bg-[#e11d48] hover:bg-[#be123c] text-white text-xs font-bold rounded-full shadow-xs active:scale-95 transition-all cursor-pointer border-0"
                        >
                          Xuất ảnh
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecordToDelete({ id: rec.id, batchNumber });
                          }}
                          title="Xóa đợt hủy này"
                          className="p-1.5 text-slate-700 hover:text-rose-600 rounded-full transition-colors cursor-pointer"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {sortedItems.length === 0 ? (
                        <div className="text-center py-4 text-slate-400 text-xs italic">
                          Đang tải hoặc chưa có món nào trong đợt này.
                        </div>
                      ) : (
                        sortedItems.map((item, i) => {
                          const displayCode = formatBarcodeDisplay(item.internal_code || item.barcode);
                          const positionDisplay = (item.form_stt !== null && item.form_stt !== undefined)
                            ? item.form_stt
                            : 'ko có';

                          return (
                            <div
                              key={i}
                              className="bg-[#e11d48] text-white rounded-2xl p-3.5 shadow-sm space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-extrabold text-white text-sm tracking-tight leading-snug">
                                  {item.product_name}
                                </h4>
                                <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-white/20 text-white font-extrabold text-[0.72rem]">
                                  SL: {item.quantity}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-white text-slate-900 rounded-full py-1.5 px-3 flex items-center gap-2 min-w-0 shadow-xs">
                                  <BarcodeIcon size={16} className="text-slate-800 shrink-0" strokeWidth={2.2} />
                                  <span className="font-mono font-bold text-xs sm:text-sm tracking-wider truncate">
                                    {displayCode}
                                  </span>
                                </div>

                                <div className="bg-white text-slate-950 rounded-full py-1.5 px-3.5 shrink-0 flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs whitespace-nowrap">
                                  <span>Ô số: <strong className="font-black">{positionDisplay}</strong></span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {exportModalData && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-extrabold text-slate-900">
                  Ảnh Phiếu Huỷ - Đợt {exportModalData.number}
                </h3>
                <button
                  type="button"
                  onClick={() => setExportModalData(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 flex items-center justify-center bg-slate-50 rounded-2xl my-3">
                {isGeneratingImage ? (
                  <div className="py-12 text-xs text-slate-500 font-bold">
                    Đang kết xuất hình ảnh...
                  </div>
                ) : exportModalData.imageData ? (
                  <img
                    src={exportModalData.imageData.dataUrl}
                    alt="Phiếu hủy hàng"
                    className="max-w-full rounded-xl shadow-md border border-slate-200"
                  />
                ) : null}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  disabled={!exportModalData.imageData}
                  className="flex-1 py-2.5 bg-[#e11d48] hover:bg-[#be123c] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all disabled:opacity-50"
                >
                  <Download size={14} />
                  <span>Tải ảnh</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyImageToClipboard}
                  disabled={!exportModalData.imageData}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                >
                  {copiedImageToast ? (
                    <>
                      <Check size={14} className="text-emerald-600" />
                      <span className="text-emerald-600">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {recordToDelete && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-xs w-full p-5 shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>

              <div className="text-center space-y-1">
                <h4 className="font-extrabold text-slate-900 text-base">
                  Xóa đợt {recordToDelete.batchNumber}?
                </h4>
                <p className="text-xs text-slate-500">
                  Bản ghi đợt hủy này sẽ bị xóa khỏi hệ thống và không thể khôi phục.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRecordToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all border-0"
                >
                  Hủy bỏ
                </button>
                  <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all border-0 shadow-xs"
                >
                  {isDeleting ? 'Đang xóa...' : 'Xóa ngay'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteAllModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-xs w-full p-5 shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>

              <div className="text-center space-y-1">
                <h4 className="font-extrabold text-slate-900 text-base">
                  Xóa tất cả ({records.length} đợt)?
                </h4>
                <p className="text-xs text-slate-500">
                  Toàn bộ các đợt hủy đã lưu sẽ bị xóa sạch và không thể khôi phục.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsDeleteAllModalOpen(false)}
                  disabled={isDeletingAll}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all border-0"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAll}
                  disabled={isDeletingAll}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all border-0 shadow-xs"
                >
                  {isDeletingAll ? 'Đang xóa...' : 'Xóa tất cả'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <BarcodeScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        disposalMode={true}
        disposalTemplates={templates}
        localProducts={products}
        onDisposalProductFound={handleDisposalProductFound}
      />
    </motion.div>
  );
};
