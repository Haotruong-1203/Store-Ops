import { DisposalRecord, DisposalRecordItem, formatBarcodeDisplay } from '../lib/disposalService';

export interface GeneratedDisposalImage {
  blob: Blob;
  dataUrl: string;
}

export const generateDisposalImage = async (
  recordNumber: number,
  record: DisposalRecord,
  items: DisposalRecordItem[]
): Promise<GeneratedDisposalImage> => {
  const scale = 2;
  const width = 420;
  
  const headerHeight = 70;
  const itemHeight = 92;
  const itemGap = 12;
  const padding = 20;

  const totalHeight = headerHeight + items.length * (itemHeight + itemGap) + padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas 2d context');

  ctx.scale(scale, scale);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, totalHeight);

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(12, 12, width - 24, totalHeight - 24, 24);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Đợt ${recordNumber}`, 28, 44);

  const dateStr = new Date(record.created_at).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }) + ' ' + new Date(record.created_at).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit'
  });

  ctx.fillStyle = '#64748b';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(dateStr, 28, 64);

  let currentY = headerHeight + 12;

  items.forEach((item) => {
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.roundRect(24, currentY, width - 48, itemHeight, 18);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    
    let displayName = item.product_name;
    displayName += ` (SL: ${item.quantity})`;
    if (displayName.length > 32) {
      displayName = displayName.substring(0, 30) + '...';
    }
    ctx.fillText(displayName, 38, currentY + 28);

    const pillY = currentY + 44;
    const pillH = 34;

    const codeText = formatBarcodeDisplay(item.internal_code || item.barcode);
    const leftPillW = width - 48 - 140 - 28;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(36, pillY, leftPillW, pillH, 17);
    ctx.fill();

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`|||  ${codeText}`, 46, pillY + 22);

    const rightPillX = 36 + leftPillW + 10;
    const rightPillW = 120;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(rightPillX, pillY, rightPillW, pillH, 17);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    
    const posText = (item.form_stt !== null && item.form_stt !== undefined)
      ? `${item.form_stt}`
      : 'ko có';
    ctx.fillText(`Ô số: ${posText}`, rightPillX + rightPillW / 2, pillY + 22);

    currentY += itemHeight + itemGap;
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas to blob failed'));
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      resolve({ blob, dataUrl });
    }, 'image/png');
  });
};
