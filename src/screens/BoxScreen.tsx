import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Layers, 
  Quote, 
  QrCode, 
  Images, 
  Camera, 
  Plus, 
  X, 
  UploadCloud,
  RefreshCw,
  Package
} from 'lucide-react';
import { 
  BoxItem, 
  BoxPhoto, 
  subscribeBox, 
  subscribeAllBoxes, 
  subscribeAllPhotos, 
  saveBoxPhoto, 
  getNextBoxId 
} from '../lib/boxService';
import { BoxQrGeneratorModal } from '../components/BoxQrGeneratorModal';
import { BoxLibraryModal } from '../components/BoxLibraryModal';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';

interface BoxScreenProps {
  onBack: () => void;
  currentUser?: { username: string; name: string; role: 'admin' | 'user' } | null;
  initialBoxId?: string;
  isGuestMode?: boolean;
  onLoginRequest?: () => void;
}

export const BoxScreen: React.FC<BoxScreenProps> = ({
  onBack,
  currentUser,
  initialBoxId = 'id001',
  isGuestMode = false,
  onLoginRequest
}) => {
  const [currentBoxId, setCurrentBoxId] = useState<string>(initialBoxId);
  const [boxData, setBoxData] = useState<BoxItem | null>(null);
  const [photos, setPhotos] = useState<BoxPhoto[]>([]);
  const [allBoxes, setAllBoxes] = useState<BoxItem[]>([]);
  const [allPhotos, setAllPhotos] = useState<BoxPhoto[]>([]);
  
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [newBoxInput, setNewBoxInput] = useState<string>('');

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState<string>('');
  const [isSavingPhoto, setIsSavingPhoto] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialBoxId && initialBoxId !== currentBoxId) {
      setCurrentBoxId(initialBoxId);
    }
  }, [initialBoxId]);

  useEffect(() => {
    const unsubBox = subscribeBox(currentBoxId, (b, pList) => {
      setBoxData(b);
      setPhotos(pList);
      setActivePhotoIndex(0);
    });

    const unsubAllBoxes = subscribeAllBoxes((list) => {
      setAllBoxes(list);
    });

    const unsubAllPhotos = subscribeAllPhotos((list) => {
      setAllPhotos(list);
    });

    return () => {
      unsubBox();
      unsubAllBoxes();
      unsubAllPhotos();
    };
  }, [currentBoxId]);

  const currentDisplayPhoto = photos[activePhotoIndex] || null;

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 900;
          const MAX_HEIGHT = 900;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.72));
          } else {
            reject(new Error('Cannot get canvas context'));
          }
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await compressImage(file);
      setPreviewImage(base64);
      setPhotoCaption('');
    } catch {
      alert('Không thể đọc hình ảnh');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveCapturedPhoto = async () => {
    if (!previewImage) return;

    setIsSavingPhoto(true);
    try {
      await saveBoxPhoto(
        currentBoxId,
        previewImage,
        photoCaption,
        currentUser?.name || ''
      );
      setPreviewImage(null);
      setPhotoCaption('');
    } catch {
      alert('Lỗi khi lưu hình ảnh');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const handleBarcodeScanned = (scannedValue: string) => {
    setIsScannerOpen(false);
    let targetId = scannedValue.trim().toLowerCase();

    try {
      if (targetId.includes('boxid=')) {
        const parts = targetId.split('boxid=');
        if (parts[1]) {
          targetId = parts[1].split('&')[0].trim().toLowerCase();
        }
      } else if (targetId.includes('box=')) {
        const parts = targetId.split('box=');
        if (parts[1]) {
          targetId = parts[1].split('&')[0].trim().toLowerCase();
        }
      }
    } catch {}

    if (targetId) {
      setCurrentBoxId(targetId);
      try {
        window.history.replaceState({}, '', `${window.location.pathname}?boxId=${encodeURIComponent(targetId)}`);
      } catch {}
    }
  };

  const canManage = !isGuestMode && Boolean(currentUser);

  return (
    <div className="flex flex-col min-h-screen bg-[#f5f5f7] font-sans text-slate-800 antialiased selection:bg-blue-500 selection:text-white pb-8">
      <div className="w-full max-w-4xl lg:max-w-5xl mx-auto flex flex-col px-4 pt-3 space-y-3">
        
        <header className="flex items-center justify-between py-1.5">
          {canManage ? (
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-white/90 shadow-apple-soft border-0 text-slate-700 font-medium text-xs active:scale-95 transition-all cursor-pointer hover:bg-white"
            >
              <ChevronLeft size={16} className="text-slate-600" />
              <span>Quay lại</span>
            </button>
          ) : (
            <div className="w-16" />
          )}

          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Trong Thùng
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-semibold text-xs font-mono uppercase">
              {currentBoxId}
            </span>
          </div>

          <div className="w-16 flex justify-end">
            {!canManage && onLoginRequest && (
              <button
                onClick={onLoginRequest}
                className="text-[0.72rem] text-[#0071e3] font-medium hover:underline cursor-pointer"
              >
                Đăng nhập
              </button>
            )}
          </div>
        </header>

        <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-slate-900 shadow-apple-lg border-0 flex flex-col justify-between p-4 select-none">
          {currentDisplayPhoto ? (
            <img
              src={currentDisplayPhoto.imageUrl}
              alt={currentDisplayPhoto.caption || currentBoxId}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-500 bg-slate-900">
              <Package size={36} strokeWidth={1.5} className="text-slate-600 mb-2" />
              <div className="text-xs font-medium text-slate-400">Chưa có ảnh trong thùng</div>
            </div>
          )}

          <div className="relative z-10 flex items-start justify-end w-full">
            <button
              onClick={() => {
                if (photos.length > 1) {
                  setActivePhotoIndex((prev) => (prev + 1) % photos.length);
                } else {
                  setIsLibraryOpen(true);
                }
              }}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border-0 text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer hover:bg-black/50 shadow-apple-soft"
            >
              <Layers size={17} />
            </button>
          </div>
        </div>

        {currentDisplayPhoto?.caption && (
          <div className="bg-white/90 backdrop-blur-md rounded-2xl p-3.5 shadow-apple-soft border-0 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 mt-0.5">
              <Quote size={14} className="fill-slate-600/20" />
            </div>
            <div className="flex-1 min-w-0 text-xs font-medium text-slate-800 leading-snug">
              {currentDisplayPhoto.caption}
            </div>
          </div>
        )}

        {canManage ? (
          <div className="space-y-2 pt-1">
            <label className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full text-sm flex items-center justify-center gap-2 shadow-apple active:scale-[0.99] transition-all cursor-pointer border-0">
              <Camera size={18} />
              <span>Cập nhật ảnh</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setIsScannerOpen(true)}
                className="py-3 px-2 bg-white/90 hover:bg-white text-slate-700 font-medium rounded-2xl text-xs flex flex-col items-center justify-center gap-1.5 border-0 shadow-apple-soft active:scale-95 transition-all cursor-pointer"
              >
                <QrCode size={18} className="text-slate-600" />
                <span className="truncate">Quét mã khác</span>
              </button>

              <button
                onClick={() => setIsLibraryOpen(true)}
                className="relative py-3 px-2 bg-white/90 hover:bg-white text-slate-700 font-medium rounded-2xl text-xs flex flex-col items-center justify-center gap-1.5 border-0 shadow-apple-soft active:scale-95 transition-all cursor-pointer"
              >
                {allPhotos.length > 0 && (
                  <span className="absolute top-1.5 right-2 w-4 h-4 rounded-full bg-slate-800 text-white font-bold text-[0.6rem] flex items-center justify-center">
                    {allPhotos.length}
                  </span>
                )}
                <Images size={18} className="text-slate-600" />
                <span>Thư viện</span>
              </button>

              <button
                onClick={async () => {
                  const nextId = await getNextBoxId();
                  setNewBoxInput(nextId);
                  setIsQrModalOpen(true);
                }}
                className="py-3 px-2 bg-white/90 hover:bg-white text-slate-700 font-medium rounded-2xl text-xs flex flex-col items-center justify-center gap-1.5 border-0 shadow-apple-soft active:scale-95 transition-all cursor-pointer"
              >
                <Plus size={18} className="text-slate-600" />
                <span className="truncate">Tạo mã mới</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={() => setIsScannerOpen(true)}
              className="py-3.5 px-3 bg-white/90 hover:bg-white text-slate-700 font-medium rounded-2xl text-xs flex items-center justify-center gap-2 border-0 shadow-apple-soft active:scale-95 transition-all cursor-pointer"
            >
              <QrCode size={18} className="text-slate-600" />
              <span>Quét mã khác</span>
            </button>

            <button
              onClick={() => setIsLibraryOpen(true)}
              className="relative py-3.5 px-3 bg-white/90 hover:bg-white text-slate-700 font-medium rounded-2xl text-xs flex items-center justify-center gap-2 border-0 shadow-apple-soft active:scale-95 transition-all cursor-pointer"
            >
              <Images size={18} className="text-slate-600" />
              <span>Thư viện</span>
              {allPhotos.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[0.65rem] border-0 shadow-apple-soft">
                  {allPhotos.length}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {previewImage && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              className="bg-white/95 backdrop-blur-xl w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 flex flex-col space-y-3.5 shadow-apple-lg border-0"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">
                  Lưu ảnh {currentBoxId.toUpperCase()}
                </h3>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 border-0 shadow-apple-soft">
                <img
                  src={previewImage}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>

              <input
                type="text"
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="Ghi chú trong thùng..."
                className="w-full px-4 py-3 bg-slate-100/80 border-0 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                autoFocus
              />

              <button
                disabled={isSavingPhoto}
                onClick={handleSaveCapturedPhoto}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full text-xs flex items-center justify-center gap-1.5 shadow-apple active:scale-95 transition-all cursor-pointer disabled:opacity-50 border-0"
              >
                {isSavingPhoto ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={15} />
                    <span>Lưu ảnh</span>
                  </>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BoxQrGeneratorModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        initialBoxId={newBoxInput || currentBoxId}
        onSelectBox={(boxId) => setCurrentBoxId(boxId)}
      />

      <BoxLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        photos={allPhotos}
        boxes={allBoxes}
        currentBoxId={currentBoxId}
        onSelectBox={(boxId) => setCurrentBoxId(boxId)}
      />

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleBarcodeScanned}
      />
    </div>
  );
};
export default BoxScreen;
