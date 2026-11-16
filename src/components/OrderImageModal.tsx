import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  Share2, 
  FileText, 
  AlertCircle, 
  Sparkles, 
  Loader2,
  Calendar,
  User,
  Package
} from 'lucide-react';
import { ConsumableOrder } from '../lib/consumableService';
import { 
  generateOrderReceiptImage, 
  formatOrderDateTime, 
  formatOrderAsText,
  GeneratedReceipt 
} from '../utils/orderReceiptGenerator';

interface OrderImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ConsumableOrder | null;
  orderNumber: number | string;
}

export const OrderImageModal: React.FC<OrderImageModalProps> = ({
  isOpen,
  onClose,
  order,
  orderNumber
}) => {
  const [receipt, setReceipt] = useState<GeneratedReceipt | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'info' | 'error'>('info');

  useEffect(() => {
    if (isOpen && order) {
      setIsGenerating(true);
      setReceipt(null);
      setCopiedImage(false);
      setCopiedText(false);
      setStatusMessage(null);

      // Small tick to ensure fonts/canvas can initialize smoothly
      const timer = setTimeout(() => {
        generateOrderReceiptImage(order, orderNumber)
          .then((res) => {
            setReceipt(res);
            setIsGenerating(false);
          })
          .catch((err) => {
            console.error('Lỗi tạo ảnh phiếu đặt hàng:', err);
            setIsGenerating(false);
            setStatusMessage('Không thể tạo ảnh phiếu. Vui lòng thử lại.');
            setStatusType('error');
          });
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [isOpen, order, orderNumber]);

  if (!isOpen || !order) return null;

  const totalQuantity = order.records.reduce((acc, r) => acc + (r.quantity || 0), 0);
  const timeInfo = formatOrderDateTime(order.createdAt);
  const orderCreator = order.creatorName || order.userId || 'Người dùng';

  // Handle Copy Image to Clipboard
  const handleCopyImage = async () => {
    if (!receipt?.blob) return;

    try {
      // Check if ClipboardItem is supported
      if (typeof window.ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
        const item = new window.ClipboardItem({ 'image/png': receipt.blob });
        await navigator.clipboard.write([item]);
        setCopiedImage(true);
        setStatusMessage('Đã sao chép ảnh vào bộ nhớ tạm! Bạn có thể mở Zalo, Messenger... và nhấn Dán (Paste).');
        setStatusType('success');
        setTimeout(() => setCopiedImage(false), 3500);
        return;
      }
      throw new Error('ClipboardItem API not supported');
    } catch (err) {
      console.warn('Lỗi chép ảnh qua clipboard:', err);
      // Fallback: Check if can share or offer download
      if (canShareFile()) {
        setStatusMessage('Trình duyệt chưa hỗ trợ sao chép ảnh trực tiếp. Vui lòng dùng nút "Chia sẻ ảnh" hoặc "Tải ảnh" bên dưới.');
        setStatusType('info');
      } else {
        setStatusMessage('Trình duyệt chưa hỗ trợ ghi ảnh vào Clipboard. Hãy nhấn "Tải ảnh về máy" hoặc nhấn giữ vào ảnh để copy.');
        setStatusType('info');
      }
    }
  };

  // Check if Web Share API with files is supported
  const canShareFile = () => {
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && receipt?.blob) {
      const testFile = new File([receipt.blob], 'test.png', { type: 'image/png' });
      return navigator.canShare({ files: [testFile] });
    }
    return false;
  };

  // Handle Native Share (Mobile Zalo, Messenger, etc.)
  const handleShare = async () => {
    if (!receipt?.blob) return;

    try {
      const fileName = `phieu-dat-hang-${orderNumber}.png`;
      const file = new File([receipt.blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Phiếu đặt hàng #${orderNumber}`,
          text: `Phiếu đặt hàng #${orderNumber} (${totalQuantity} sản phẩm) - Tạo lúc ${timeInfo.full}`
        });
        setStatusMessage('Đã gửi chia sẻ thành công!');
        setStatusType('success');
      } else if (navigator.share) {
        await navigator.share({
          title: `Phiếu đặt hàng #${orderNumber}`,
          text: formatOrderAsText(order, orderNumber)
        });
      } else {
        handleDownload();
      }
    } catch (err) {
      // User cancelled share or failed
      if ((err as Error)?.name !== 'AbortError') {
        console.warn('Share error', err);
      }
    }
  };

  // Handle Download Image PNG
  const handleDownload = () => {
    if (!receipt?.dataUrl) return;

    const fileName = `Phieu-Dat-Hang-#${orderNumber}-${timeInfo.date.replace(/\//g, '-')}.png`;
    const link = document.createElement('a');
    link.href = receipt.dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setStatusMessage('Đã tải ảnh phiếu về máy!');
    setStatusType('success');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Handle Copy as Text
  const handleCopyText = async () => {
    try {
      const text = formatOrderAsText(order, orderNumber);
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setStatusMessage('Đã sao chép nội dung đặt hàng dạng văn bản!');
      setStatusType('success');
      setTimeout(() => {
        setCopiedText(false);
        setStatusMessage(null);
      }, 3000);
    } catch (err) {
      console.error(err);
      setStatusMessage('Không thể sao chép văn bản.');
      setStatusType('error');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal Window */}
        <motion.div
          initial={{ y: '100%', opacity: 0.5 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="relative w-full max-w-xl bg-white/95 backdrop-blur-xl rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 max-h-[92vh] flex flex-col shadow-apple-lg z-10 overflow-hidden border-0"
        >
          {/* Header */}
          <div className="flex justify-between items-start pb-2 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-700">
                  XUẤT ẢNH
                </span>
                <h2 className="text-lg font-black text-slate-800">
                  Phiếu Đặt Hàng #{orderNumber}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} className="text-slate-400" />
                  {timeInfo.full}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <User size={12} className="text-slate-400" />
                  {orderCreator}
                </span>
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Toast / Status banner */}
          {statusMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-3 p-3 rounded-2xl text-xs font-semibold flex items-start gap-2 ${
                statusType === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-0 shadow-apple-soft'
                  : statusType === 'error'
                  ? 'bg-rose-50 text-rose-800 border-0 shadow-apple-soft'
                  : 'bg-blue-50 text-blue-800 border-0 shadow-apple-soft'
              }`}
            >
              {statusType === 'success' ? (
                <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={16} className="text-blue-600 shrink-0 mt-0.5" />
              )}
              <span className="flex-1 leading-relaxed">{statusMessage}</span>
            </motion.div>
          )}

          {/* Quick Summary Pill Bar */}
          <div className="mt-3 py-2.5 px-4 bg-slate-100/80 rounded-2xl flex items-center justify-between text-xs text-slate-600 shrink-0 border-0 shadow-apple-soft">
            <span className="flex items-center gap-1.5 font-medium">
              <Package size={14} className="text-blue-600" />
              Mặt hàng: <strong className="text-slate-900 font-bold">{order.records.length} loại</strong>
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              Tổng số lượng: <strong className="text-emerald-600 font-extrabold text-sm">{totalQuantity}</strong>
            </span>
          </div>

          {/* Image Preview Container */}
          <div className="my-3 flex-1 overflow-y-auto no-scrollbar rounded-3xl bg-slate-100/70 p-3 sm:p-4 flex items-center justify-center min-h-[220px] border-0 shadow-apple-soft">
            {isGenerating ? (
              <div className="flex flex-col items-center gap-3 py-10 text-slate-500">
                <Loader2 size={32} className="animate-spin text-blue-600" />
                <span className="text-xs font-semibold">Đang kết xuất ảnh phiếu rõ nét...</span>
              </div>
            ) : receipt ? (
              <div className="relative group max-w-full">
                <img
                  src={receipt.dataUrl}
                  alt={`Phiếu đặt hàng #${orderNumber}`}
                  className="w-full max-h-[50vh] object-contain rounded-2xl shadow-apple border-0 bg-white"
                />
                <div className="text-center mt-2">
                  <span className="text-[11px] text-slate-500 italic">
                    💡 Gợi ý: Trên điện thoại bạn cũng có thể nhấn giữ vào ảnh trên để chọn &quot;Sao chép&quot; hoặc &quot;Lưu ảnh&quot;
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">Không có dữ liệu ảnh.</div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 shrink-0 space-y-2">
            {/* Primary Action: Sao chép ảnh */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyImage}
                disabled={isGenerating || !receipt}
                className={`py-3.5 px-4 rounded-full font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-apple transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border-0 ${
                  copiedImage
                    ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/25'
                }`}
              >
                {copiedImage ? (
                  <>
                    <Check size={18} />
                    <span>ĐÃ SAO CHÉP ẢNH!</span>
                  </>
                ) : (
                  <>
                    <Copy size={18} />
                    <span>SAO CHÉP ẢNH</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isGenerating || !receipt}
                className="py-3.5 px-4 rounded-full font-bold text-xs sm:text-sm bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2 shadow-apple active:scale-95 transition-all cursor-pointer disabled:opacity-50 border-0"
              >
                <Download size={18} />
                <span>TẢI ẢNH VỀ MÁY</span>
              </button>
            </div>

            {/* Secondary Actions: Chia sẻ app (Zalo/Messenger) & Chép text */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleShare}
                disabled={isGenerating || !receipt}
                className="py-3 px-4 rounded-full font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 border-0 shadow-apple-soft"
              >
                <Share2 size={15} className="text-blue-600" />
                <span>Chia sẻ qua Zalo/App</span>
              </button>

              <button
                type="button"
                onClick={handleCopyText}
                className="py-3 px-4 rounded-full font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 border-0 shadow-apple-soft"
              >
                {copiedText ? (
                  <>
                    <Check size={15} className="text-emerald-600" />
                    <span>Đã chép text</span>
                  </>
                ) : (
                  <>
                    <FileText size={15} className="text-slate-500" />
                    <span>Sao chép dạng chữ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
