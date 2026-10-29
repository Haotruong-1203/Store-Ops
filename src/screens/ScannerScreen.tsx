import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Header, InputGroup, Card } from '../components/SharedUI';
import { Product, ExpiryRecord, ProductData } from '../types/product';
import { formatDate, calculateDestructionDate, getProductRecords } from '../lib/utils';
import { useBarcodeScanner, stopAllCameraMediaTracks } from '../hooks/useBarcodeScanner';
import { useBarcodeSearch } from '../hooks/useBarcodeSearch';
import { useBarcodeFromImage } from '../hooks/useBarcodeFromImage';
import { usePriceTagOCR } from '../hooks/usePriceTagOCR';
import { useAddProductToFirestore } from '../hooks/useAddProductToFirestore';
import { captureVideoFrame } from '../utils/canvasCapture';
import { capturePriceTagFrame, uploadPriceTagImage } from '../utils/priceTagCapture';
import { ProductConfirmationForm } from '../components/ProductConfirmationForm';
import { 
  Check, 
  Plus, 
  Layers, 
  Trash2, 
  Calendar, 
  Camera, 
  Upload, 
  RefreshCw, 
  Loader2, 
  AlertCircle, 
  Square,
  Sparkles,
  Barcode as BarcodeIcon,
  Receipt,
  RotateCcw
} from 'lucide-react';

const ScannerScreen: React.FC<{ 
  onBack: () => void;
  products: Product[];
  onAdd: (p: Omit<Product, 'id'>) => Promise<void>;
  onUpdate?: (p: Product) => Promise<void>;
  currentUserId?: string;
}> = ({ onBack, products, onAdd, onUpdate, currentUserId }) => {
  // Mode: 'barcode' or 'price_tag'
  const [scanMode, setScanMode] = useState<'barcode' | 'price_tag'>('barcode');

  // Live camera scanner
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
    product: foundProduct, 
    loading: searchLoading, 
    error: searchError, 
    searchByBarcode 
  } = useBarcodeSearch();

  // Photo capture and image analysis fallback for barcode
  const {
    barcode: imageBarcode,
    format: detectedFormat,
    confidence: detectedConfidence,
    loading: isAnalyzingBarcode,
    error: imageAnalysisError,
    analyzeImage: analyzeBarcodeImage,
    resetAnalysis: resetBarcodeAnalysis
  } = useBarcodeFromImage();

  // Price Tag OCR hook
  const {
    productData: ocrProductData,
    loading: isAnalyzingPriceTag,
    error: priceTagOcrError,
    confidence: ocrConfidence,
    analyzeImage: analyzePriceTagImage,
    resetOCR: resetPriceTagOCR
  } = usePriceTagOCR();

  // Direct Firestore add hook for price tag OCR
  const {
    loading: isSavingProduct,
    error: saveProductError,
    addProduct
  } = useAddProductToFirestore();

  // Selected or created product state
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [existingProduct, setExistingProduct] = useState<Product | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Price tag confirmation state
  const [confirmedProductData, setConfirmedProductData] = useState<ProductData | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const priceTagFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastProcessedBarcode = useRef<string | null>(null);

  // New product form
  const [formData, setFormData] = useState({ 
    internalCode: '', 
    name: '', 
    price: '',
    destroyDaysBeforeExpiry: '15',
    expDate: '',
    destructionDate: '',
    quantity: '',
    note: ''
  });

  // Modal to add record to existing product from scanner
  const [isAddingRecordToExisting, setIsAddingRecordToExisting] = useState(false);
  const [newRecordData, setNewRecordData] = useState({
    expDate: '',
    destroyDays: '15',
    destructionDate: '',
    quantity: '',
    note: ''
  });

  // Start scanner on mount and rigorously cleanup camera tracks on unmount
  useEffect(() => {
    startScan();
    return () => {
      stopScan();
      stopAllCameraMediaTracks();
    };
  }, [startScan, stopScan]);

  // When live scan finds a barcode
  useEffect(() => {
    if (liveBarcode && liveBarcode !== lastProcessedBarcode.current && scanMode === 'barcode') {
      lastProcessedBarcode.current = liveBarcode;
      handleBarcodeDetected(liveBarcode);
    }
  }, [liveBarcode, scanMode]);

  // Central handler when any barcode is identified (live or image capture)
  const handleBarcodeDetected = async (code: string) => {
    stopScan();
    setScannedBarcode(code);

    // 1. Check local products list prop
    const found = products.find(p => p.barcode === code || p.internalCode === code);
    if (found) {
      setExistingProduct(found);
      setIsAddingNew(false);
      setConfirmedProductData(null);
      return;
    }

    // 2. Query Firestore directly via searchByBarcode
    await searchByBarcode(code);
  };

  // Sync foundProduct from searchByBarcode to existingProduct or open Add New form
  useEffect(() => {
    if (foundProduct) {
      setExistingProduct(foundProduct);
      setIsAddingNew(false);
      setConfirmedProductData(null);
    } else if (searchError && scannedBarcode) {
      // Product not found in Firestore -> open Add New form
      setExistingProduct(null);
      setIsAddingNew(true);
      setFormData({
        internalCode: '',
        name: '',
        price: '',
        destroyDaysBeforeExpiry: '15',
        expDate: '',
        destructionDate: '',
        quantity: '',
        note: ''
      });
    }
  }, [foundProduct, searchError, scannedBarcode]);

  // Handle Photo Capture from video stream (Barcode mode)
  const handleCapturePhoto = async () => {
    if (!videoRef.current) return;
    const base64Frame = captureVideoFrame(videoRef);
    if (!base64Frame) {
      alert('Không thể chụp hình từ camera. Hãy chắc chắn camera đã sẵn sàng.');
      return;
    }

    setCapturedImage(base64Frame);
    stopScan();

    const result = await analyzeBarcodeImage(base64Frame);
    if (result && result.barcode) {
      lastProcessedBarcode.current = result.barcode;
      await handleBarcodeDetected(result.barcode);
    }
  };

  // Handle manual image file upload for Barcode
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File ảnh quá lớn. Vui lòng chọn ảnh tối đa 5MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setCapturedImage(previewUrl);
    stopScan();

    const result = await analyzeBarcodeImage(file);
    if (result && result.barcode) {
      lastProcessedBarcode.current = result.barcode;
      await handleBarcodeDetected(result.barcode);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Switch to Price Tag Scan Mode
  const handleStartPriceTagScan = () => {
    setScanMode('price_tag');
    setCapturedImage(null);
    setIsAddingNew(false);
    setConfirmedProductData(null);
    resetPriceTagOCR();
    startScan();
  };

  // Capture Price Tag Photo from Video
  const handleCapturePriceTagPhoto = async () => {
    if (!videoRef.current) return;
    const base64Frame = capturePriceTagFrame(videoRef);
    if (!base64Frame) {
      alert('Không thể chụp hình bảng giá. Vui lòng thử lại.');
      return;
    }

    setCapturedImage(base64Frame);
    stopScan();

    const fallbackCode = scannedBarcode || liveBarcode || '';
    const extractedData = await analyzePriceTagImage(base64Frame, fallbackCode);
    if (extractedData) {
      setConfirmedProductData(extractedData);
    }
  };

  // Upload Price Tag Image from File
  const handlePriceTagFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await uploadPriceTagImage(file);
      setCapturedImage(base64);
      stopScan();

      const fallbackCode = scannedBarcode || liveBarcode || '';
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
      setConfirmedProductData(null);
      setScanMode('barcode');
      // Look up and set as existing product
      await searchByBarcode(data.barcode);
    }
  };

  // Reset & Resume live scanning
  const handleResumeScan = () => {
    setScanMode('barcode');
    setScannedBarcode(null);
    setExistingProduct(null);
    setIsAddingNew(false);
    setIsAddingRecordToExisting(false);
    setCapturedImage(null);
    setConfirmedProductData(null);
    lastProcessedBarcode.current = null;
    resetBarcodeAnalysis();
    resetPriceTagOCR();
    startScan();
  };

  // Create new product submission (Manual form)
  const handleSaveNewProduct = async () => {
    if (!scannedBarcode) return;
    if (!formData.name.trim()) {
      alert('Vui lòng nhập tên sản phẩm!');
      return;
    }

    const daysBefore = parseInt(formData.destroyDaysBeforeExpiry) || 0;
    const initialRecords: ExpiryRecord[] = [];

    if (formData.expDate) {
      const calcDestruct = formData.destructionDate || calculateDestructionDate(formData.expDate, daysBefore);
      initialRecords.push({
        id: 'rec-' + Date.now(),
        expDate: formData.expDate,
        destructionDate: calcDestruct,
        quantity: parseInt(formData.quantity) || undefined,
        note: formData.note.trim() || undefined,
        createdAt: new Date().toISOString()
      });
    }

    const newProd: Omit<Product, 'id'> = {
      barcode: scannedBarcode,
      internalCode: formData.internalCode.trim() || undefined,
      name: formData.name.trim(),
      price: parseInt(formData.price) || 0,
      destroyDaysBeforeExpiry: daysBefore,
      destructionDate: initialRecords.length > 0 ? initialRecords[0].destructionDate : '',
      expiryRecords: initialRecords
    };

    await onAdd(newProd);
    handleResumeScan();
  };

  // Open modal to add record to existing product
  const handleOpenAddRecordToExisting = () => {
    if (!existingProduct) return;
    const defaultDays = String(existingProduct.destroyDaysBeforeExpiry || 15);
    setNewRecordData({
      expDate: '',
      destroyDays: defaultDays,
      destructionDate: '',
      quantity: '',
      note: ''
    });
    setIsAddingRecordToExisting(true);
  };

  const handleNewRecordExpChange = (expDate: string, daysBefore: string) => {
    const calc = calculateDestructionDate(expDate, parseInt(daysBefore) || 0);
    setNewRecordData(prev => ({
      ...prev,
      expDate,
      destroyDays: daysBefore,
      destructionDate: calc
    }));
  };

  const handleSaveRecordToExisting = async () => {
    if (!existingProduct || !newRecordData.expDate) {
      alert('Vui lòng chọn Hạn sử dụng (HSD)!');
      return;
    }

    const daysBefore = parseInt(newRecordData.destroyDays) || 0;
    const finalDestructionDate = newRecordData.destructionDate || calculateDestructionDate(newRecordData.expDate, daysBefore);

    const newRecord: ExpiryRecord = {
      id: 'rec-' + Date.now(),
      expDate: newRecordData.expDate,
      destructionDate: finalDestructionDate,
      quantity: parseInt(newRecordData.quantity) || undefined,
      note: newRecordData.note.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    const currentRecords = getProductRecords(existingProduct);
    const updatedRecords = [...currentRecords, newRecord].sort(
      (a, b) => new Date(a.destructionDate).getTime() - new Date(b.destructionDate).getTime()
    );

    const updatedProduct: Product = {
      ...existingProduct,
      destructionDate: updatedRecords[0].destructionDate,
      expiryRecords: updatedRecords
    };

    if (onUpdate) {
      await onUpdate(updatedProduct);
      setExistingProduct(updatedProduct);
    }

    setIsAddingRecordToExisting(false);
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!existingProduct) return;
    if (!confirm('Xóa record hạn này?')) return;

    const currentRecords = getProductRecords(existingProduct);
    const updated = currentRecords.filter(r => r.id !== recordId);
    const updatedProduct: Product = {
      ...existingProduct,
      destructionDate: updated.length > 0 ? updated[0].destructionDate : '',
      expiryRecords: updated
    };

    if (onUpdate) {
      await onUpdate(updatedProduct);
      setExistingProduct(updatedProduct);
    }
  };

  const inputClass = "w-full max-w-full box-border block p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[0.95rem] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

  const isBusy = searchLoading || isAnalyzingBarcode || isAnalyzingPriceTag || isSavingProduct;
  const activeError = scannerError || imageAnalysisError || priceTagOcrError || saveProductError;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: -20 }} 
      className="h-full flex flex-col pb-28"
    >
      <Header 
        title={scanMode === 'price_tag' ? 'QUÉT BẢNG GIÁ (OCR)' : 'QUÉT BARCODE'} 
        onBack={() => {
          if (scanMode === 'price_tag') {
            setScanMode('barcode');
            handleResumeScan();
          } else {
            stopScan();
            stopAllCameraMediaTracks();
            onBack();
          }
        }} 
      />

      {/* DIRECT SCAN MODE TABS: BARCODE vs BẢNG GIÁ OCR */}
      <div className="flex bg-slate-100 p-1 rounded-2xl mb-3 border border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (scanMode !== 'barcode') {
              setScanMode('barcode');
              setCapturedImage(null);
              setConfirmedProductData(null);
              resetBarcodeAnalysis();
              startScan();
            }
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            scanMode === 'barcode'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarcodeIcon size={16} />
          <span>Quét Barcode</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (scanMode !== 'price_tag') {
              handleStartPriceTagScan();
            }
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            scanMode === 'price_tag'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-amber-800 hover:text-amber-900 bg-amber-50/50'
          }`}
        >
          <Receipt size={16} />
          <span>Quét Bảng Giá (OCR)</span>
        </button>
      </div>
      
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={priceTagFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePriceTagFileChange}
        className="hidden"
      />

      <div className="flex-1 flex flex-col">
        {/* Camera / Image Viewport */}
        <div className="relative rounded-[2rem] overflow-hidden bg-slate-950 aspect-[4/3] shadow-lg mb-3 shrink-0">
          {/* 1. Captured Photo Preview (if captured) */}
          {capturedImage ? (
            <img 
              src={capturedImage} 
              alt="Ảnh chụp" 
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            /* 2. Live Video Feed from Camera */
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                scanning ? 'opacity-100' : 'opacity-20'
              }`}
            />
          )}

          {/* Scanner Overlay Box when scanning live */}
          {scanning && !capturedImage && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`border-2 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-all ${
                scanMode === 'price_tag'
                  ? 'w-72 h-48 border-amber-400/90'
                  : 'w-64 h-40 border-emerald-400/80'
              }`}>
                {/* Glowing animated scanline */}
                <motion.div 
                  animate={{ y: scanMode === 'price_tag' ? [0, 184, 0] : [0, 156, 0] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className={`w-full h-0.5 shadow-[0_0_8px] ${
                    scanMode === 'price_tag'
                      ? 'bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-amber-400'
                      : 'bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-red-500'
                  }`}
                />
                {/* Corner brackets */}
                <div className={`absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 rounded-tl-lg ${
                  scanMode === 'price_tag' ? 'border-amber-400' : 'border-blue-500'
                }`} />
                <div className={`absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 rounded-tr-lg ${
                  scanMode === 'price_tag' ? 'border-amber-400' : 'border-blue-500'
                }`} />
                <div className={`absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 rounded-bl-lg ${
                  scanMode === 'price_tag' ? 'border-amber-400' : 'border-blue-500'
                }`} />
                <div className={`absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 rounded-br-lg ${
                  scanMode === 'price_tag' ? 'border-amber-400' : 'border-blue-500'
                }`} />
              </div>
            </div>
          )}

          {/* Analyzing / Querying Loading Overlay */}
          {isBusy && (
            <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-white text-center">
              <Loader2 size={44} className="text-emerald-400 animate-spin mb-3" />
              <p className="text-sm font-bold">
                {isAnalyzingPriceTag
                  ? 'Đang phân tích bảng giá (OCR)...'
                  : isAnalyzingBarcode
                  ? 'Đang phân tích mã vạch...'
                  : isSavingProduct
                  ? 'Đang lưu vào cơ sở dữ liệu...'
                  : 'Đang tra cứu sản phẩm...'}
              </p>
              {scannedBarcode && (
                <p className="text-xs text-slate-300 font-mono mt-1">Mã: {scannedBarcode}</p>
              )}
            </div>
          )}

          {/* Error Message Overlay */}
          {activeError && !isBusy && !scannedBarcode && !confirmedProductData && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-black/85 text-center">
              <div className="bg-rose-50 border-2 border-rose-500 rounded-2xl p-4 max-w-xs">
                <AlertCircle size={32} className="text-rose-600 mx-auto mb-2" />
                <p className="text-rose-700 font-bold text-sm mb-1">Thông báo</p>
                <p className="text-rose-600 text-xs">{activeError}</p>
                <div className="mt-3 flex gap-2">
                  <button 
                    onClick={handleResumeScan}
                    className="flex-1 bg-rose-600 text-white px-3 py-2 rounded-xl font-bold text-xs shadow cursor-pointer"
                  >
                    Thử lại
                  </button>
                  <button
                    onClick={() => {
                      if (scanMode === 'price_tag') {
                        priceTagFileInputRef.current?.click();
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                    className="flex-1 bg-slate-200 text-slate-700 px-3 py-2 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Tải ảnh
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls Toolbar: CHỤP ẢNH / TẢI ẢNH / QUÉT TIẾP */}
        {!confirmedProductData && (
          <div className="bg-white rounded-2xl p-2.5 border border-slate-200 shadow-sm mb-3">
            {scanMode === 'price_tag' ? (
              /* PRICE TAG SCANNING CONTROLS */
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCapturePriceTagPhoto}
                    disabled={isBusy}
                    className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-amber-500/30 transition-all cursor-pointer text-sm"
                  >
                    <Camera size={20} />
                    Chụp bảng giá
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScanMode('barcode');
                      handleResumeScan();
                    }}
                    className="h-12 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs"
                  >
                    Quay lại
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => priceTagFileInputRef.current?.click()}
                  disabled={isBusy}
                  className="w-full h-10 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload size={15} />
                  Tải ảnh bảng giá từ thư viện (JPG, PNG)
                </button>
              </div>
            ) : scanning && !capturedImage ? (
              /* BARCODE LIVE SCANNING CONTROLS */
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    disabled={isBusy}
                    className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-emerald-600/30 transition-all cursor-pointer text-sm"
                  >
                    <Camera size={20} />
                    Chụp ảnh phân tích
                  </button>
                  <button
                    type="button"
                    onClick={stopScan}
                    className="h-12 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs"
                  >
                    <Square size={16} />
                    Dừng
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  className="w-full h-10 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload size={15} />
                  Hoặc tải ảnh mã vạch từ máy (JPG, PNG)
                </button>
              </div>
            ) : (
              /* RESUME / RETRY BARCODE */
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleResumeScan}
                  disabled={isBusy}
                  className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/30 transition-all cursor-pointer text-sm"
                >
                  <RefreshCw size={18} />
                  {capturedImage ? 'Chụp lại' : 'Bật camera quét tiếp'}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  className="h-12 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs"
                >
                  <Upload size={16} />
                  Tải ảnh
                </button>
              </div>
            )}
          </div>
        )}

        {/* Display detected barcode indicator */}
        {scannedBarcode && !confirmedProductData && (
          <div className="mb-3 px-3.5 py-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
            <span className="text-blue-700 font-semibold flex items-center gap-1.5">
              <BarcodeIcon size={16} /> Mã đã nhận diện:
            </span>
            <span className="font-mono font-black text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200 text-sm">
              {scannedBarcode}
            </span>
          </div>
        )}

        {/* Results / Forms container */}
        <AnimatePresence mode="wait">
          {/* OCR CONFIRMATION FORM */}
          {confirmedProductData && (
            <motion.div key="ocr_confirm" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
              <Card>
                <ProductConfirmationForm
                  productData={confirmedProductData}
                  confidence={ocrConfidence}
                  onSave={handleSaveConfirmedProduct}
                  onCancel={handleResumeScan}
                  isSaving={isSavingProduct}
                />
              </Card>
            </motion.div>
          )}

          {/* CASE 1: EXISTING PRODUCT FOUND */}
          {existingProduct && !confirmedProductData && (
            <motion.div key="existing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800 text-lg">Thông tin sản phẩm</h3>
                  <div className="bg-emerald-100 text-emerald-600 p-1.5 rounded-full"><Check size={20} /></div>
                </div>
                
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-[0.8rem] text-slate-500 font-bold uppercase">Barcode</span>
                    <span className="font-mono font-bold text-slate-800">{existingProduct.barcode}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-[0.8rem] text-slate-500 font-bold uppercase">Tên sản phẩm</span>
                    <span className="font-bold text-slate-800 text-right max-w-[200px]">{existingProduct.name}</span>
                  </div>
                  {existingProduct.internalCode && (
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-[0.8rem] text-slate-500 font-bold uppercase">Mã nội bộ</span>
                      <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        #{existingProduct.internalCode}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-[0.8rem] text-slate-500 font-bold uppercase">Giá bán</span>
                    <span className="font-extrabold text-blue-600 text-lg">{(existingProduct.price || 0).toLocaleString('vi-VN')}đ</span>
                  </div>
                  {existingProduct.destroyDaysBeforeExpiry ? (
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-[0.8rem] text-slate-500 font-bold uppercase">Hủy trước HSD</span>
                      <span className="font-semibold text-slate-700">{existingProduct.destroyDaysBeforeExpiry} ngày</span>
                    </div>
                  ) : null}
                </div>

                {/* Expiry Records List */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                      <Layers size={14} /> Danh sách đợt HSD ({getProductRecords(existingProduct).length})
                    </span>
                    <button 
                      onClick={handleOpenAddRecordToExisting}
                      className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} /> Thêm đợt HSD
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {getProductRecords(existingProduct).map(rec => (
                      <div key={rec.id} className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100">
                        <div className="text-xs space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700">HSD: {formatDate(rec.expDate)}</span>
                            {rec.quantity && <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 font-bold">SL: {rec.quantity}</span>}
                          </div>
                          <div className="text-rose-600 font-bold">Hủy: {formatDate(rec.destructionDate)}</div>
                          {rec.note && <div className="text-slate-400 italic text-[0.7rem]">{rec.note}</div>}
                        </div>
                        <button 
                          onClick={() => handleDeleteRecord(rec.id)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 cursor-pointer"
                          title="Xóa đợt này"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {getProductRecords(existingProduct).length === 0 && (
                      <p className="text-center text-xs text-slate-400 py-2">Chưa có ghi nhận HSD nào</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button 
                    onClick={handleResumeScan}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl active:scale-95 transition-all text-sm cursor-pointer"
                  >
                    Quét mã khác
                  </button>
                  <button 
                    onClick={handleOpenAddRecordToExisting}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md active:scale-95 transition-all text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={18} /> Thêm đợt hạn
                  </button>
                </div>
              </Card>
            </motion.div>
          )}

          {/* CASE 2: NEW PRODUCT NOT FOUND -> CREATE FORM OR SCAN PRICE TAG */}
          {isAddingNew && !confirmedProductData && (
            <motion.div key="new" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">Mã chưa có trong hệ thống</h3>
                    <p className="text-xs text-slate-400">Chọn quét bảng giá để tự động điền hoặc nhập tay</p>
                  </div>
                  <button 
                    onClick={handleResumeScan}
                    className="text-slate-400 hover:text-slate-600 p-1 text-xs cursor-pointer"
                  >
                    Quét lại
                  </button>
                </div>

                {/* PROMINENT "QUÉT BẢNG GIÁ" BUTTON */}
                <div className="mb-4 p-3 bg-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                    <Sparkles size={16} className="text-amber-600 shrink-0" />
                    Tự động nhập thông tin từ tem bảng giá
                  </div>
                  <button
                    type="button"
                    onClick={handleStartPriceTagScan}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-amber-500/25 transition-all cursor-pointer"
                  >
                    <Receipt size={18} />
                    Quét bảng giá để thêm thông tin
                  </button>
                </div>

                {/* MANUAL FALLBACK FORM */}
                <div className="space-y-3.5 pt-2 border-t border-slate-100">
                  <div className="text-xs font-bold text-slate-600 uppercase">
                    Hoặc nhập thông tin thủ công:
                  </div>

                  <InputGroup label="Mã vạch (Barcode)">
                    <input 
                      type="text" 
                      readOnly 
                      className={`${inputClass} bg-slate-100 font-mono font-bold text-slate-500 cursor-not-allowed`} 
                      value={scannedBarcode || ''} 
                    />
                  </InputGroup>

                  <InputGroup label="Tên sản phẩm *">
                    <input 
                      type="text" 
                      placeholder="Nhập tên sản phẩm" 
                      className={inputClass} 
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})} 
                    />
                  </InputGroup>

                  <div className="grid grid-cols-2 gap-3">
                    <InputGroup label="Mã nội bộ (SKU)">
                      <input 
                        type="text" 
                        placeholder="Tối đa 8 số" 
                        maxLength={8}
                        className={inputClass} 
                        value={formData.internalCode} 
                        onChange={e => setFormData({...formData, internalCode: e.target.value})} 
                      />
                    </InputGroup>
                    <InputGroup label="Giá bán (VNĐ)">
                      <input 
                        type="number" 
                        inputMode="numeric" 
                        pattern="[0-9]*"
                        placeholder="VD: 50000" 
                        className={inputClass} 
                        value={formData.price} 
                        onChange={e => setFormData({...formData, price: e.target.value})} 
                      />
                    </InputGroup>
                  </div>

                  <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-100 space-y-3">
                    <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                      <Calendar size={15} /> Thêm HSD đợt đầu (Tùy chọn)
                    </span>

                    <InputGroup label="Hạn sử dụng (HSD)">
                      <input 
                        type="date" 
                        className={inputClass} 
                        value={formData.expDate} 
                        onChange={e => {
                          const exp = e.target.value;
                          const days = parseInt(formData.destroyDaysBeforeExpiry) || 0;
                          setFormData({
                            ...formData, 
                            expDate: exp,
                            destructionDate: calculateDestructionDate(exp, days)
                          });
                        }} 
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
                          value={formData.destroyDaysBeforeExpiry} 
                          onChange={e => {
                            const days = parseInt(e.target.value) || 0;
                            setFormData({
                              ...formData, 
                              destroyDaysBeforeExpiry: e.target.value,
                              destructionDate: calculateDestructionDate(formData.expDate, days)
                            });
                          }} 
                        />
                      </InputGroup>
                      <InputGroup label="Số lượng">
                        <input 
                          type="number" 
                          inputMode="numeric" 
                          pattern="[0-9]*"
                          min="0"
                          placeholder="VD: 10" 
                          className={inputClass} 
                          value={formData.quantity} 
                          onChange={e => setFormData({...formData, quantity: e.target.value})} 
                        />
                      </InputGroup>
                    </div>

                    {formData.expDate && (
                      <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl flex justify-between items-center text-xs">
                        <span className="font-semibold text-rose-700">Ngày phải hủy:</span>
                        <span className="font-mono font-bold text-rose-600 text-sm">
                          {formatDate(formData.destructionDate)}
                        </span>
                      </div>
                    )}

                    <InputGroup label="Ghi chú">
                      <input 
                        type="text" 
                        placeholder="VD: Lô mới, kệ A1..." 
                        className={inputClass} 
                        value={formData.note} 
                        onChange={e => setFormData({...formData, note: e.target.value})} 
                      />
                    </InputGroup>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={handleResumeScan}
                      className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl active:scale-95 transition-all text-sm cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button 
                      onClick={handleSaveNewProduct}
                      className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-md active:scale-95 transition-all text-sm cursor-pointer"
                    >
                      Lưu sản phẩm
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Prompt when idle and no product */}
          {!existingProduct && !isAddingNew && !isBusy && !confirmedProductData && (
            <div className="text-center text-xs text-slate-500 py-3">
              {scanMode === 'price_tag'
                ? 'Hướng camera vào tem bảng giá rồi bấm "Chụp bảng giá" để nhận diện tự động.'
                : 'Đưa mã vạch vào khung ngắm camera, hoặc bấm "Chụp ảnh phân tích" nếu camera khó lấy nét.'}
            </div>
          )}
        </AnimatePresence>

        {/* MODAL: ADD RECORD TO EXISTING PRODUCT */}
        <AnimatePresence>
          {isAddingRecordToExisting && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl"
              >
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">Thêm đợt HSD</h3>
                    <p className="text-xs text-slate-400 truncate max-w-[220px]">{existingProduct?.name}</p>
                  </div>
                  <button onClick={() => setIsAddingRecordToExisting(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                    ✕
                  </button>
                </div>

                <div className="space-y-3.5">
                  <InputGroup label="Hạn sử dụng (HSD) *">
                    <input 
                      type="date" 
                      className={inputClass} 
                      value={newRecordData.expDate} 
                      onChange={e => handleNewRecordExpChange(e.target.value, newRecordData.destroyDays)} 
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
                        value={newRecordData.destroyDays} 
                        onChange={e => handleNewRecordExpChange(newRecordData.expDate, e.target.value)} 
                      />
                    </InputGroup>
                    <InputGroup label="Số lượng">
                      <input 
                        type="number" 
                        inputMode="numeric" 
                        pattern="[0-9]*"
                        min="0"
                        placeholder="VD: 5" 
                        className={inputClass} 
                        value={newRecordData.quantity} 
                        onChange={e => setNewRecordData({...newRecordData, quantity: e.target.value})} 
                      />
                    </InputGroup>
                  </div>

                  {newRecordData.expDate && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex justify-between items-center text-xs">
                      <span className="font-semibold text-rose-700">Ngày phải hủy:</span>
                      <span className="font-mono font-bold text-rose-600 text-sm">
                        {formatDate(newRecordData.destructionDate)}
                      </span>
                    </div>
                  )}

                  <InputGroup label="Ghi chú">
                    <input 
                      type="text" 
                      placeholder="VD: Kệ ngoài, cận date" 
                      className={inputClass} 
                      value={newRecordData.note} 
                      onChange={e => setNewRecordData({...newRecordData, note: e.target.value})} 
                    />
                  </InputGroup>

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setIsAddingRecordToExisting(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl active:scale-95 cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button 
                      onClick={handleSaveRecordToExisting}
                      className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-md active:scale-95 cursor-pointer"
                    >
                      Lưu hạn
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ScannerScreen;
