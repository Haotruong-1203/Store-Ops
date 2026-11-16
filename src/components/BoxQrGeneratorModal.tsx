import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { motion } from 'motion/react';
import { X, Download, Copy, Printer, Check, QrCode, ArrowRight, Hash } from 'lucide-react';

interface BoxQrGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBoxId?: string;
  onSelectBox?: (boxId: string) => void;
}

export const BoxQrGeneratorModal: React.FC<BoxQrGeneratorModalProps> = ({
  isOpen,
  onClose,
  initialBoxId = 'id001',
  onSelectBox
}) => {
  const [boxIdInput, setBoxIdInput] = useState(initialBoxId);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (initialBoxId) {
      setBoxIdInput(initialBoxId);
    }
  }, [initialBoxId, isOpen]);

  const cleanBoxId = boxIdInput.trim().toLowerCase() || 'id001';
  const matchNum = cleanBoxId.match(/\d+/);
  const displayNum = matchNum ? parseInt(matchNum[0], 10).toString() : cleanBoxId;

  const getScanUrl = (id: string) => {
    return `${window.location.origin}/?boxId=${encodeURIComponent(id)}`;
  };

  const drawQrWithCenteredNumber = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scanUrl = getScanUrl(cleanBoxId);

    try {
      await QRCode.toCanvas(canvas, scanUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 480,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = canvas.width;
      const center = size / 2;
      const badgeSize = Math.round(size * 0.24);
      const halfBadge = badgeSize / 2;
      const cornerRadius = 16;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(
        center - halfBadge,
        center - halfBadge,
        badgeSize,
        badgeSize,
        cornerRadius
      );
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const textLen = displayNum.length;
      let fontSize = 48;
      if (textLen >= 3) fontSize = 34;
      if (textLen >= 4) fontSize = 26;

      ctx.font = `900 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText(displayNum, center, center + 1);

      ctx.restore();
    } catch {}
  };

  useEffect(() => {
    if (isOpen) {
      drawQrWithCenteredNumber();
    }
  }, [isOpen, cleanBoxId, displayNum]);

  const generateFullStickerBlob = async (): Promise<Blob | null> => {
    const qrCanvas = canvasRef.current;
    if (!qrCanvas) return null;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 600;
    exportCanvas.height = 760;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, exportCanvas.width - 32, exportCanvas.height - 32);

    ctx.fillStyle = '#1e293b';
    ctx.font = '900 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`THÙNG HÀNG SỐ ${displayNum}`, exportCanvas.width / 2, 75);

    ctx.fillStyle = '#64748b';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText(`Mã định danh: ${cleanBoxId.toUpperCase()}`, exportCanvas.width / 2, 115);

    const qrSize = 460;
    const qrX = (exportCanvas.width - qrSize) / 2;
    const qrY = 145;
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = '#0284c7';
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillText('QUÉT MÃ ĐỂ XEM & CẬP NHẬT ẢNH TRONG THÙNG', exportCanvas.width / 2, 640);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText(getScanUrl(cleanBoxId), exportCanvas.width / 2, 675);

    return new Promise((resolve) => {
      exportCanvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  };

  const handleDownload = async () => {
    const blob = await generateFullStickerBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ma_QR_Thung_${displayNum}_${cleanBoxId}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      const blob = await generateFullStickerBlob();
      if (!blob) return;

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } else {
        await handleDownload();
      }
    } catch {
      await handleDownload();
    }
  };

  const handlePrint = () => {
    const qrCanvas = canvasRef.current;
    if (!qrCanvas) return;
    const qrDataUrl = qrCanvas.toDataURL('image/png');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mã QR Thùng #${displayNum}</title>
          <style>
            @page { size: auto; margin: 10mm; }
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              text-align: center;
              padding: 20px;
              color: #0f172a;
            }
            .card {
              display: inline-block;
              border: 3px solid #0f172a;
              border-radius: 20px;
              padding: 24px 32px;
              max-width: 380px;
            }
            h1 { font-size: 28px; margin: 0 0 6px 0; font-weight: 900; }
            .sub { font-size: 16px; color: #475569; margin: 0 0 16px 0; font-weight: 700; }
            img { width: 280px; height: 280px; display: block; margin: 0 auto 16px auto; }
            .foot { font-size: 13px; font-weight: 800; color: #0284c7; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>THÙNG HÀNG SỐ ${displayNum}</h1>
            <div class="sub">Mã: ${cleanBoxId.toUpperCase()}</div>
            <img src="${qrDataUrl}" alt="QR" />
            <div class="foot">Quét mã xem ảnh trong thùng</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleApplyBox = () => {
    if (onSelectBox) {
      onSelectBox(cleanBoxId);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <motion.div 
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        className="bg-white w-full sm:w-[26rem] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-apple-lg border-0 flex flex-col max-h-[92vh] overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode size={18} className="text-indigo-600" />
            <h3 className="font-extrabold text-slate-800 text-sm">Tạo Mã QR Thùng</h3>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Hash size={16} />
              </div>
              <input
                type="text"
                value={boxIdInput}
                onChange={(e) => setBoxIdInput(e.target.value)}
                placeholder="id001"
                className="w-full pl-9 pr-16 py-3 bg-slate-100/80 rounded-2xl text-slate-800 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 uppercase border-0"
              />
              <button
                type="button"
                onClick={() => {
                  const match = cleanBoxId.match(/\d+/);
                  const n = match ? parseInt(match[0], 10) + 1 : 1;
                  setBoxIdInput(`id${String(n).padStart(3, '0')}`);
                }}
                className="absolute right-2 top-2 px-2.5 py-1 text-xs font-bold bg-white text-indigo-600 rounded-xl shadow-apple-soft border-0 cursor-pointer"
              >
                +1
              </button>
            </div>
          </div>

          <div className="bg-slate-100/70 rounded-3xl p-4 shadow-apple-soft border-0 flex flex-col items-center text-center">
            <div className="p-3 bg-white rounded-2xl shadow-apple border-0">
              <canvas 
                ref={canvasRef} 
                className="w-48 h-48 rounded-lg block max-w-full"
              />
            </div>
            <div className="mt-2 text-xs font-black text-slate-800">
              THÙNG #{displayNum} ({cleanBoxId.toUpperCase()})
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleDownload}
              className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer"
            >
              <Download size={16} />
              <span>Tải về</span>
            </button>

            <button
              onClick={handleCopy}
              className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer"
            >
              {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
              <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer"
            >
              <Printer size={16} />
              <span>In mã</span>
            </button>
          </div>

          <button
            onClick={handleApplyBox}
            className="w-full py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
          >
            <span>Mở thùng {cleanBoxId.toUpperCase()}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
