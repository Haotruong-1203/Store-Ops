import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Check,
  Delete,
  FileText,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Barcode as BarcodeIcon,
  X
} from 'lucide-react';
import { Header, Card } from '../components/SharedUI';
import { useBarcodeScanner, stopAllCameraMediaTracks } from '../hooks/useBarcodeScanner';
import { useProductSearch } from '../hooks/useProductSearch';
import { Product } from '../lib/firestoreService';
import {
  FillItem,
  resolveProductForFill,
  saveFillItemOnline,
  deleteFillItemOnline,
  deleteAllFillItemsOnline,
  subscribeFillItems,
  fetchFillItems
} from '../lib/fillService';
import { formatBarcodeDisplay } from '../lib/disposalService';

interface FillScreenProps {
  onBack: () => void;
  products?: Product[];
}

export const FillScreen: React.FC<FillScreenProps> = ({ onBack, products = [] }) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'saved'>('scan');
  const [savedItems, setSavedItems] = useState<FillItem[]>([]);
  const [loadingSaved, setLoadingSaved] = useState<boolean>(false);

  const [selectedProduct, setSelectedProduct] = useState<{
    name: string;
    barcode: string;
    internalCode?: string | null;
  } | null>(null);

  const [qtyString, setQtyString] = useState<string>('');
  const [isLookingUp, setIsLookingUp] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState<boolean>(false);
  const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);

  const {
    searchTerm,
    setSearchTerm,
    results: searchResults,
    loading: isSearchingManual,
    clearSearch
  } = useProductSearch(220);

  const handleBarcodeDetected = useCallback(
    async (scannedCode: string) => {
      const clean = (scannedCode || '').trim();
      if (!clean || isLookingUp || selectedProduct) return;

      stopScan();
      setIsLookingUp(true);
      try {
        const found = await resolveProductForFill(clean, products);
        if (found) {
          setSelectedProduct(found);
        } else {
          setSelectedProduct({
            name: `Sản phẩm (${clean})`,
            barcode: clean,
            internalCode: null
          });
        }
        setQtyString('');
        clearSearch();
      } finally {
        setIsLookingUp(false);
      }
    },
    [isLookingUp, selectedProduct, products, clearSearch]
  );

  const {
    videoRef,
    scanning,
    error: cameraError,
    startScan,
    stopScan,
    setBarcode
  } = useBarcodeScanner(handleBarcodeDetected);

  useEffect(() => {
    const unsub = subscribeFillItems((list) => {
      setSavedItems(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (activeTab === 'scan' && !selectedProduct) {
      startScan();
    } else {
      stopScan();
      stopAllCameraMediaTracks();
    }
  }, [activeTab, selectedProduct, startScan, stopScan]);

  useEffect(() => {
    return () => {
      stopScan();
      stopAllCameraMediaTracks();
    };
  }, [stopScan]);

  const handleRefreshSaved = async () => {
    setLoadingSaved(true);
    try {
      const list = await fetchFillItems();
      setSavedItems(list);
    } finally {
      setLoadingSaved(false);
    }
  };

  const handleSelectManualProduct = (p: Product) => {
    stopScan();
    stopAllCameraMediaTracks();
    setSelectedProduct({
      name: p.name,
      barcode: p.barcode,
      internalCode: p.internalCode || null
    });
    setQtyString('');
    clearSearch();
  };

  const handleManualSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = searchTerm.trim();
    if (!raw || isLookingUp) return;

    stopScan();
    setIsLookingUp(true);
    try {
      const found = await resolveProductForFill(raw, products);
      if (found) {
        setSelectedProduct(found);
      } else if (searchResults.length > 0) {
        const first = searchResults[0];
        setSelectedProduct({
          name: first.name,
          barcode: first.barcode,
          internalCode: first.internalCode || null
        });
      } else {
        setSelectedProduct({
          name: raw,
          barcode: raw,
          internalCode: null
        });
      }
      setQtyString('');
      clearSearch();
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleDigitPress = (digit: string) => {
    setQtyString((prev) => {
      if (prev.length >= 4) return prev;
      if (prev === '0') return digit;
      return prev + digit;
    });
  };

  const handleBackspace = () => {
    setQtyString((prev) => prev.slice(0, -1));
  };

  const handleClearQty = () => {
    setQtyString('');
  };

  const handleResetScan = () => {
    setBarcode(null);
    setSelectedProduct(null);
    setQtyString('');
  };

  const handleSaveFill = async () => {
    if (!selectedProduct || isSaving) return;
    const qty = Math.max(1, parseInt(qtyString || '1', 10) || 1);

    setIsSaving(true);
    try {
      const saved = await saveFillItemOnline(selectedProduct, qty);
      setSavedItems((prev) => [saved, ...prev.filter((i) => i.barcode !== saved.barcode)]);
      setSaveToast(`Đã lưu: ${selectedProduct.name} (SL: ${qty})`);
      setTimeout(() => setSaveToast(null), 2200);
      setBarcode(null);
      setSelectedProduct(null);
      setQtyString('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOne = async (barcode: string) => {
    setSavedItems((prev) => prev.filter((i) => i.barcode !== barcode));
    await deleteFillItemOnline(barcode);
  };

  const handleConfirmDeleteAll = async () => {
    if (isDeletingAll) return;
    setIsDeletingAll(true);
    try {
      await deleteAllFillItemsOnline();
      setSavedItems([]);
      setIsDeleteAllModalOpen(false);
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full bg-transparent min-h-dvh pb-20 relative"
    >
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-xl pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 transition-all border-b border-slate-200/60 shadow-xs mb-3">
        <div className="max-w-4xl lg:max-w-5xl mx-auto w-full">
          <Header
            title="FILL HÀNG"
            className="!mb-2 shadow-apple-soft"
            onBack={() => {
              stopScan();
              stopAllCameraMediaTracks();
              onBack();
            }}
          />

          <div className="flex p-1.5 bg-slate-200/60 backdrop-blur-md rounded-full shadow-apple-soft border-0 w-full">
            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className={`flex-1 py-2.5 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border-0 ${
                activeTab === 'scan'
                  ? 'bg-amber-600 text-white shadow-apple-soft'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera size={15} />
              <span>Quét mã</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('saved');
                handleRefreshSaved();
              }}
              className={`flex-1 py-2.5 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border-0 ${
                activeTab === 'saved'
                  ? 'bg-amber-600 text-white shadow-apple-soft'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText size={15} />
              <span>Đã lưu</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[0.7rem] font-bold ${
                  activeTab === 'saved' ? 'bg-white/25 text-white' : 'bg-slate-300 text-slate-800'
                }`}
              >
                {savedItems.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {saveToast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-extrabold"
          >
            <Check size={15} />
            <span className="truncate max-w-[80vw]">{saveToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 px-4 max-w-4xl lg:max-w-5xl mx-auto w-full">
        {activeTab === 'scan' && (
          <div className="space-y-3">
            {!selectedProduct ? (
              <Card className="!p-3.5 sm:!p-5 space-y-3.5">
                <div className="relative rounded-3xl overflow-hidden bg-slate-950 aspect-[4/3] max-h-[42vh] w-full shadow-apple">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className={`w-full h-full object-cover transition-opacity duration-200 ${
                      scanning ? 'opacity-100' : 'opacity-20'
                    }`}
                  />

                  {scanning && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-60 h-36 border-2 border-amber-400/90 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                        <motion.div
                          animate={{ y: [0, 136, 0] }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
                          className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_#fbbf24]"
                        />
                        <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
                        <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
                        <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
                      </div>
                    </div>
                  )}

                  {isLookingUp && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2">
                      <Loader2 size={28} className="animate-spin text-amber-400" />
                      <span className="text-xs font-bold">Đang tìm sản phẩm...</span>
                    </div>
                  )}

                  {!scanning && !isLookingUp && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-white bg-slate-900/80">
                      <Camera size={36} className="text-slate-400 mb-2" />
                      <p className="text-xs text-slate-300 mb-3">
                        {cameraError || 'Camera đang tạm dừng'}
                      </p>
                      <button
                        type="button"
                        onClick={startScan}
                        className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm active:scale-95 transition-all cursor-pointer border-0"
                      >
                        Bật camera quét
                      </button>
                    </div>
                  )}
                </div>

                <form onSubmit={handleManualSubmitCode} className="relative">
                  <div className="relative flex items-center">
                    <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Hoặc nhập mã vạch / tên sản phẩm..."
                      className="w-full bg-slate-100/90 border-0 rounded-2xl pl-9 pr-9 py-3 text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                    {isSearchingManual ? (
                      <Loader2 size={15} className="absolute right-3 text-amber-600 animate-spin" />
                    ) : searchTerm ? (
                      <button
                        type="button"
                        onClick={clearSearch}
                        className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer border-0"
                      >
                        <X size={15} />
                      </button>
                    ) : null}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-apple-lg border border-slate-100 overflow-hidden z-30 max-h-56 overflow-y-auto">
                      {searchResults.map((p) => (
                        <button
                          key={p.id || p.barcode}
                          type="button"
                          onClick={() => handleSelectManualProduct(p)}
                          className="w-full text-left px-4 py-2.5 hover:bg-amber-50/60 border-b border-slate-50 last:border-0 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">{p.name}</p>
                            <p className="text-[0.7rem] text-slate-400 font-mono">{p.barcode}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </form>
              </Card>
            ) : (
              <Card className="!p-4 sm:!p-5 space-y-4">
                <div className="p-3.5 rounded-2xl bg-amber-50/80 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 block mb-0.5">
                      Sản phẩm đã chọn
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug break-words">
                      {selectedProduct.name}
                    </h3>
                    <div className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 rounded-lg bg-white text-slate-700 font-mono text-xs font-bold shadow-2xs">
                      <BarcodeIcon size={14} className="text-amber-600" />
                      <span>{formatBarcodeDisplay(selectedProduct.barcode)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetScan}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer border-0 shrink-0"
                  >
                    <RotateCcw size={13} />
                    <span>Quét lại</span>
                  </button>
                </div>

                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-400 text-center mb-1.5">
                    Số lượng cần fill
                  </span>
                  <div className="w-full py-3 px-4 rounded-2xl bg-slate-100/90 text-center flex items-center justify-center min-h-[60px]">
                    <span className={`text-3xl sm:text-4xl font-black tracking-tight font-mono ${
                      qtyString ? 'text-slate-900' : 'text-slate-400'
                    }`}>
                      {qtyString || '1'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-2.5 select-none">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleDigitPress(digit)}
                      className="h-13 sm:h-14 rounded-2xl bg-slate-100 hover:bg-slate-200/80 active:bg-amber-100 text-slate-900 text-xl font-black transition-all active:scale-95 cursor-pointer border-0 shadow-2xs"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleClearQty}
                    className="h-13 sm:h-14 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-sm font-extrabold transition-all active:scale-95 cursor-pointer border-0"
                  >
                    Xóa
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDigitPress('0')}
                    className="h-13 sm:h-14 rounded-2xl bg-slate-100 hover:bg-slate-200/80 active:bg-amber-100 text-slate-900 text-xl font-black transition-all active:scale-95 cursor-pointer border-0 shadow-2xs"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="h-13 sm:h-14 rounded-2xl bg-slate-200/80 hover:bg-slate-300/80 text-slate-700 flex items-center justify-center transition-all active:scale-95 cursor-pointer border-0"
                  >
                    <Delete size={20} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveFill}
                  disabled={isSaving}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black text-base flex items-center justify-center gap-2 shadow-apple active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 border-0"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={20} strokeWidth={2.5} />}
                  <span>{isSaving ? 'Đang lưu...' : 'Lưu'}</span>
                </button>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1 mb-1">
              <h3 className="text-sm font-bold text-slate-800">
                Đã lưu ({savedItems.length})
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRefreshSaved}
                  disabled={loadingSaved}
                  title="Làm mới"
                  className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 border-0"
                >
                  <RefreshCw size={15} className={loadingSaved ? 'animate-spin text-amber-600' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeleteAllModalOpen(true)}
                  disabled={savedItems.length === 0 || isDeletingAll}
                  title="Xóa tất cả"
                  className="w-8 h-8 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:pointer-events-none border-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {savedItems.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-md rounded-3xl p-8 text-center text-slate-400 space-y-2 border-0">
                <Package size={36} className="mx-auto text-slate-300" strokeWidth={1.5} />
                <p className="text-xs">Chưa có sản phẩm nào trong danh sách cần fill.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('scan')}
                  className="px-4 py-2 mt-2 bg-amber-600 text-white font-bold text-xs rounded-full shadow-apple-soft cursor-pointer border-0"
                >
                  Quét hàng cần fill
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {savedItems.map((item) => (
                  <div
                    key={item.barcode}
                    className="bg-white/95 backdrop-blur-md rounded-3xl p-4 shadow-apple-soft flex items-center justify-between gap-3 border-0"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h4 className="text-base sm:text-lg font-black text-slate-900 leading-snug break-words">
                        {item.product_name}
                      </h4>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 text-slate-700 font-mono text-xs sm:text-sm font-bold">
                        <BarcodeIcon size={15} className="text-slate-500 shrink-0" />
                        <span>{formatBarcodeDisplay(item.barcode)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="min-w-[68px] sm:min-w-[78px] px-3.5 py-2 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex flex-col items-center justify-center shadow-sm">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-90">
                          SL Fill
                        </span>
                        <span className="text-2xl sm:text-3xl font-black leading-tight font-mono">
                          {item.quantity}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteOne(item.barcode)}
                        title="Xóa món này"
                        className="w-9 h-9 rounded-2xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer border-0"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
                  Xóa tất cả ({savedItems.length} món)?
                </h4>
                <p className="text-xs text-slate-500">
                  Toàn bộ danh sách hàng cần fill đã lưu sẽ bị xóa sạch.
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
    </motion.div>
  );
};

export default FillScreen;
