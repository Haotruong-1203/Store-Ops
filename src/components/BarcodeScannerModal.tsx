import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Camera, 
  Square, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  ExternalLink,
  Barcode,
  Upload,
  RefreshCw,
  Sparkles,
  Receipt,
  RotateCcw
} from 'lucide-react';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useBarcodeSearch } from '../hooks/useBarcodeSearch';
import { useBarcodeFromImage } from '../hooks/useBarcodeFromImage';
import { usePriceTagOCR } from '../hooks/usePriceTagOCR';
import { useAddProductToFirestore } from '../hooks/useAddProductToFirestore';
import { captureVideoFrame } from '../utils/canvasCapture';
import { capturePriceTagFrame, uploadPriceTagImage } from '../utils/priceTagCapture';
import { ProductConfirmationForm } from './ProductConfirmationForm';
import { Product, ProductData } from '../types/product';
import { formatDate } from '../lib/utils';

export interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductFound?: (product: Product) => void;
  onOpenCreate?: (barcode: string) => void;
  currentUserId?: string;
}

export type ModalScanMode = 'barcode' | 'price_tag';

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onProductFound,
  onOpenCreate,
  currentUserId
}) => {
  // Mode: scanning barcode or scanning price tag
  const [scanMode, setScanMode] = useState<ModalScanMode>('barcode');

  // Real-time camera scanner
  const { 
    videoRef, 
    barcode: liveBarcode, 
    scanning, 
    error: scannerError, 
    startScan, 
    stopScan, 
    setBarcode: setLiveBarcode 
  } = useBarcodeScanner();

  // Firestore product search
  const { 
    product, 
    loading: searchLoading, 
    error: searchError, 
    searchByBarcode 
  } = useBarcodeSearch();

  // Photo Capture & Image Analysis Fallback for Barcodes
  const {
    barcode: imageBarcode,
    format: detectedFormat,
    confidence: detectedConfidence,
    loading: isAnalyzingBarcode,
    error: imageAnalysisError,
    analyzeImage: analyzeBarcodeImage,
    resetAnalysis: resetBarcodeAnalysis
  } = useBarcodeFromImage();

  // Price Tag OCR
  const {
    productData: ocrProductData,
    loading: isAnalyzingPriceTag,
    error: priceTagOcrError,
    confidence: ocrConfidence,
    analyzeImage: analyzePriceTagImage,
    resetOCR: resetPriceTagOCR
  } = usePriceTagOCR();

  // Add Product to Firestore hook
  const {
    loading: isSavingProduct,
    error: saveProductError,
    addProduct
  } = useAddProductToFirestore();

  // Captured snapshot state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [confirmedProductData, setConfirmedProductData] = useState<ProductData | null>(null);
  const [justSavedSuccess, setJustSavedSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const priceTagFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastProcessedBarcode = useRef<string | null>(null);

  // Auto-start scan when modal opens
  useEffect(() => {
    if (isOpen) {
      lastProcessedBarcode.current = null;
      setCapturedImage(null);
      setScanMode('barcode');
      setConfirmedProductData(null);
      setJustSavedSuccess(false);
      resetBarcodeAnalysis();
      resetPriceTagOCR();
      startScan();
    } else {
      stopScan();
      setLiveBarcode(null);
      setCapturedImage(null);
      setConfirmedProductData(null);
      setJustSavedSuccess(false);
      resetBarcodeAnalysis();
      resetPriceTagOCR();
    }
  }, [isOpen, startScan, stopScan, setLiveBarcode, resetBarcodeAnalysis, resetPriceTagOCR]);

  // When live barcode is detected by ZXing stream
  useEffect(() => {
    if (liveBarcode && liveBarcode !== lastProcessedBarcode.current && scanMode === 'barcode') {
      lastProcessedBarcode.current = liveBarcode;
      stopScan();
      searchByBarcode(liveBarcode);
    }
  }, [liveBarcode, searchByBarcode, stopScan, scanMode]);

  // Auto-close after 1.8s on successful product found
  useEffect(() => {
    if (product) {
      const timer = setTimeout(() => {
        if (onProductFound) {
          onProductFound(product);
        }
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [product, onProductFound]);

  // Handle Photo Capture for Barcode
  const handleCaptureBarcodePhoto = async () => {
    if (!videoRef.current) return;
    const base64Frame = captureVideoFrame(videoRef);
    if (!base64Frame) {
      alert('Không thể chụp hình từ camera. Vui lòng thử lại.');
      return;
    }

    setCapturedImage(base64Frame);
    stopScan();

    const result = await analyzeBarcodeImage(base64Frame);
    if (result && result.barcode) {
      lastProcessedBarcode.current = result.barcode;
      await searchByBarcode(result.barcode);
    }
  };

  // Handle Barcode file upload
  const handleBarcodeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File quá lớn. Vui lòng chọn ảnh dung lượng tối đa 5MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setCapturedImage(previewUrl);
    stopScan();

    const result = await analyzeBarcodeImage(file);
    if (result && result.barcode) {
      lastProcessedBarcode.current = result.barcode;
      await searchByBarcode(result.barcode);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Switch to Price Tag Scan Mode
  const handleStartPriceTagScan = () => {
    setScanMode('price_tag');
    setCapturedImage(null);
    setConfirmedProductData(null);
    resetPriceTagOCR();
    startScan();
  };

  // Handle Price Tag Photo Capture from Video
  const handleCapturePriceTagPhoto = async () => {
    if (!videoRef.current) return;
    const base64Frame = capturePriceTagFrame(videoRef);
    if (!base64Frame) {
      alert('Không thể chụp hình bảng giá. Vui lòng thử lại.');
      return;
    }

    setCapturedImage(base64Frame);
    stopScan();

    const fallbackCode = liveBarcode || imageBarcode || '';
    const extractedData = await analyzePriceTagImage(base64Frame, fallbackCode);
    if (extractedData) {
      setConfirmedProductData(extractedData);
    }
  };

  // Handle Price Tag Image File Upload
  const handlePriceTagFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await uploadPriceTagImage(file);
      setCapturedImage(base64);
      stopScan();

      const fallbackCode = liveBarcode || imageBarcode || '';
      const extractedData = await analyzePriceTagImage(base64, fallbackCode);
      if (extractedData) {
        setConfirmedProductData(extractedData);
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi khi tải ảnh bảng giá.');
    }

    if (priceTagFileInputRef.current) priceTagFileInputRef.current.value = '';
  };

  // Save product confirmed from OCR to Firestore
  const handleSaveConfirmedProduct = async (data: ProductData) => {
    const newDocId = await addProduct(data, currentUserId);
    if (newDocId) {
      setJustSavedSuccess(true);
      setConfirmedProductData(null);
      // Automatically search and display product
      await searchByBarcode(data.barcode);
    }
  };

  // Re-capture / retry scanning
  const handleRetryScanning = () => {
    setCapturedImage(null);
    lastProcessedBarcode.current = null;
    setConfirmedProductData(null);
    setJustSavedSuccess(false);
    resetBarcodeAnalysis();
    resetPriceTagOCR();
    startScan();
  };

  const handleCreateNewManual = () => {
    const codeToUse = liveBarcode || imageBarcode;
    if (codeToUse && onOpenCreate) {
      onClose();
      onOpenCreate(codeToUse);
    }
  };

  if (!isOpen) return null;

  // Active states
  const isSuccess = !!product;
  const isProcessing = searchLoading || isAnalyzingBarcode || isAnalyzingPriceTag || isSavingProduct;
  const activeBarcode = liveBarcode || imageBarcode;
  const activeError = scannerError || searchError || imageAnalysisError || priceTagOcrError || saveProductError;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
      />

      {/* Modal Dialog */}
      <motion.div
        initial={{ y: 50, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 50, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col z-10 max-h-[94vh]"
      >
        {/* Hidden File Picker Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleBarcodeFileChange}
          className="hidden"
        />
        <input
          ref={priceTagFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePriceTagFileChange}
          className="hidden"
        />

        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              scanMode === 'price_tag' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
            }`}>
              {scanMode === 'price_tag' ? <Receipt size={20} /> : <Barcode size={22} />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {scanMode === 'price_tag' ? 'Quét Bảng Giá (OCR)' : 'Quét Mã Vạch'}
              </h2>
              <p className="text-[0.72rem] text-slate-500 font-medium">
                {scanMode === 'price_tag' ? 'Chụp bảng giá để tự động trích xuất thông tin' : 'Quét trực tiếp hoặc Chụp ảnh'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col items-center overflow-y-auto max-h-[calc(94vh-80px)]">
          {/* Main Visual Display Area */}
          <div className="relative w-full h-[270px] bg-slate-950 rounded-3xl overflow-hidden flex items-center justify-center shadow-inner shrink-0">
            {/* 1. Captured Photo Thumbnail View */}
            {capturedImage ? (
              <img
                src={capturedImage}
                alt="Captured visual"
                className="w-full h-full object-contain bg-black/90"
              />
            ) : (
              /* 2. Live Video Element */
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  scanning ? 'opacity-100' : 'opacity-20'
                }`}
              />
            )}

            {/* Target Reticle Overlay while Scanning Live Video */}
            {scanning && !capturedImage && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className={`border-2 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-all ${
                  scanMode === 'price_tag' 
                    ? 'w-64 h-48 border-amber-400/90' 
                    : 'w-56 h-36 border-emerald-400/80'
                }`}>
                  {/* Glowing scan line */}
                  <motion.div
                    animate={{ y: scanMode === 'price_tag' ? [0, 180, 0] : [0, 136, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                    className={`w-full h-0.5 shadow-sm ${
                      scanMode === 'price_tag'
                        ? 'bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_#fbbf24]'
                        : 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399]'
                    }`}
                  />
                  {/* Corner accents */}
                  <div className={`absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 rounded-tl-lg ${
                    scanMode === 'price_tag' ? 'border-amber-400' : 'border-emerald-400'
                  }`} />
                  <div className={`absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 rounded-tr-lg ${
                    scanMode === 'price_tag' ? 'border-amber-400' : 'border-emerald-400'
                  }`} />
                  <div className={`absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 rounded-bl-lg ${
                    scanMode === 'price_tag' ? 'border-amber-400' : 'border-emerald-400'
                  }`} />
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 rounded-br-lg ${
                    scanMode === 'price_tag' ? 'border-amber-400' : 'border-emerald-400'
                  }`} />
                </div>
              </div>
            )}

            {/* Idle Overlay when camera is paused */}
            {!scanning && !capturedImage && !isProcessing && !isSuccess && (
              <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center p-6 text-center text-white">
                <Camera size={44} className="text-slate-400 mb-2 opacity-80" />
                <p className="text-sm font-semibold mb-1">Camera đang tạm dừng</p>
                <p className="text-xs text-slate-400 max-w-xs">
                  Bấm nút bên dưới để mở camera hoặc tải ảnh lên để tìm sản phẩm
                </p>
              </div>
            )}

            {/* Processing Overlay */}
            {isProcessing && (
              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-white z-20">
                <Loader2 size={44} className="text-blue-500 animate-spin mb-3" />
                <p className="text-sm font-bold">
                  {isAnalyzingPriceTag 
                    ? 'Đang phân tích bảng giá (OCR)...' 
                    : isAnalyzingBarcode 
                    ? 'Đang phân tích mã vạch...' 
                    : isSavingProduct 
                    ? 'Đang lưu vào Firestore...' 
                    : 'Đang tìm kiếm sản phẩm...'}
                </p>
                {activeBarcode ? (
                  <p className="text-xs text-slate-400 font-mono mt-1">Mã: {activeBarcode}</p>
                ) : (
                  <p className="text-[0.72rem] text-slate-400 mt-1 flex items-center gap-1">
                    <Sparkles size={13} className="text-amber-400" /> Trích xuất tự động bằng AI/OCR
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Feedback & Result Cards Container */}
          <div className="w-full mt-3 flex flex-col justify-center">
            {/* 1. OCR CONFIRMATION FORM (When price tag is extracted) */}
            {confirmedProductData && !isSuccess && (
              <ProductConfirmationForm
                productData={confirmedProductData}
                confidence={ocrConfidence}
                onSave={handleSaveConfirmedProduct}
                onCancel={handleRetryScanning}
                isSaving={isSavingProduct}
              />
            )}

            {/* 2. SUCCESS STATE (Product Found or Added) */}
            {isSuccess && product && !confirmedProductData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">
                        {product.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-600 font-mono">
                        <span className="bg-white px-2 py-0.5 rounded border border-emerald-200 font-bold">
                          {product.barcode}
                        </span>
                        {product.sku && (
                          <span className="text-slate-500">SKU: {product.sku}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {product.price > 0 && (
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-xl">
                        {product.price.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  )}
                </div>

                {product.destroyDaysBeforeExpiry ? (
                  <div className="text-[0.72rem] text-slate-600 bg-emerald-100/50 rounded-lg px-2.5 py-1 flex items-center justify-between font-medium">
                    <span>Hủy trước HSD:</span>
                    <span className="font-bold text-emerald-800">H - {product.destroyDaysBeforeExpiry} ngày</span>
                  </div>
                ) : null}

                {justSavedSuccess && (
                  <p className="text-[0.72rem] text-emerald-700 font-bold text-center bg-emerald-100/80 py-1 rounded-lg">
                    ✓ Đã thêm sản phẩm thành công từ bảng giá!
                  </p>
                )}

                <p className="text-[0.68rem] text-emerald-600 text-center font-medium mt-0.5">
                  Tự động chuyển đến sản phẩm sau 1.8 giây...
                </p>
              </motion.div>
            )}

            {/* 3. PRODUCT NOT FOUND STATE -> SHOW PRICE TAG SCAN BUTTON */}
            {!isSuccess && activeError && !isProcessing && !confirmedProductData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-800 font-medium flex-1">
                    {activeError}
                  </div>
                </div>

                {/* HIGH-CONVERSION ACTIONS WHEN PRODUCT NOT FOUND */}
                {activeBarcode && (
                  <div className="flex flex-col gap-2 pt-1 border-t border-rose-200/60">
                    <button
                      onClick={handleStartPriceTagScan}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/25 cursor-pointer"
                    >
                      <Receipt size={17} />
                      Quét bảng giá để thêm tự động
                    </button>

                    <div className="flex gap-2">
                      {onOpenCreate && (
                        <button
                          onClick={handleCreateNewManual}
                          className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                        >
                          <Plus size={15} />
                          Nhập tay
                        </button>
                      )}
                      <button
                        onClick={handleRetryScanning}
                        className="flex-1 py-2.5 bg-rose-100 hover:bg-rose-200 active:scale-98 text-rose-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                      >
                        <RotateCcw size={15} />
                        Quét lại
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* LIVE SCANNING HINT */}
            {!isSuccess && !activeError && scanning && !isProcessing && !confirmedProductData && (
              <div className="text-center text-xs text-slate-500 py-1.5 flex flex-col items-center gap-0.5">
                <span>
                  {scanMode === 'price_tag'
                    ? 'Hướng camera vào tem/bảng giá sản phẩm rồi bấm "Chụp bảng giá"'
                    : 'Hướng camera vào mã vạch sản phẩm'}
                </span>
                <span className="text-[0.72rem] text-slate-400">
                  {scanMode === 'price_tag'
                    ? 'Đảm bảo tên, giá và mã vạch nằm trọn trong khung ngắm'
                    : 'Nếu camera khó nhận diện, hãy bấm "Chụp ảnh"'}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons Toolbar (min 48px touch targets) */}
          {!confirmedProductData && (
            <div className="w-full flex flex-col gap-2.5 mt-3 pt-2 border-t border-slate-100">
              {/* If in Price Tag scan mode */}
              {scanMode === 'price_tag' ? (
                <div className="w-full flex flex-col gap-2">
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleCapturePriceTagPhoto}
                      disabled={isProcessing}
                      className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 active:scale-98 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
                    >
                      <Camera size={20} />
                      Chụp bảng giá
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScanMode('barcode');
                        handleRetryScanning();
                      }}
                      className="h-12 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs"
                    >
                      Hủy
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => priceTagFileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="w-full h-11 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload size={16} />
                    Tải ảnh bảng giá từ máy (JPG, PNG)
                  </button>
                </div>
              ) : scanning && !capturedImage ? (
                /* In Barcode live scanning mode */
                <div className="w-full flex flex-col gap-2">
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleCaptureBarcodePhoto}
                      className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
                    >
                      <Camera size={20} />
                      Chụp ảnh
                    </button>
                    <button
                      type="button"
                      onClick={stopScan}
                      className="h-12 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Square size={16} fill="currentColor" />
                      Dừng
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload size={16} />
                    Hoặc tải ảnh từ thư viện
                  </button>
                </div>
              ) : (
                /* When not actively scanning */
                <div className="w-full flex flex-col gap-2">
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleRetryScanning}
                      disabled={isProcessing}
                      className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 active:scale-98 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
                    >
                      <RefreshCw size={18} />
                      {capturedImage ? 'Chụp lại' : isSuccess ? 'Quét mã khác' : 'Mở camera quét'}
                    </button>
                    {isSuccess && onProductFound && product && (
                      <button
                        type="button"
                        onClick={() => onProductFound(product)}
                        className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
                      >
                        <ExternalLink size={18} />
                        Xem sản phẩm
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload size={16} />
                    Tải ảnh từ thư viện (JPG, PNG, WebP)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
