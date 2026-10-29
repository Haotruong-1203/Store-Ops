import { ConsumableOrder } from '../lib/consumableService';

export interface GeneratedReceipt {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Format timestamp nicely into Vietnamese standard
 */
export function formatOrderDateTime(isoString: string): { date: string; time: string; full: string } {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return { date: 'N/A', time: 'N/A', full: 'N/A' };
    }
    const date = d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const time = d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    return {
      date,
      time,
      full: `${time} - ${date}`
    };
  } catch {
    return { date: 'N/A', time: 'N/A', full: 'N/A' };
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [text];
}

/**
 * Render order receipt into a high-resolution, crisp PNG image
 */
export async function generateOrderReceiptImage(
  order: ConsumableOrder,
  orderNumber: number | string
): Promise<GeneratedReceipt> {
  // Base logical dimensions (scale x2 for ultra-sharp Retina rendering)
  const logicalWidth = 820;
  const scale = 2;

  // Temporary canvas to measure fonts and calculate dynamic height
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d')!;

  mCtx.font = '500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  // Columns layout: STT, Mã SP, Tên sản phẩm, Số lượng (Loại bỏ cột người tạo rườm rà)
  const colWidths = {
    stt: 50,
    sku: 140,
    name: 446,
    qty: 120
  };

  // Pre-calculate line breaks for product names
  const rowDetails = order.records.map((r, index) => {
    mCtx.font = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const nameLines = wrapText(mCtx, r.name || 'Không rõ tên', colWidths.name - 20);
    const lineHeight = 22;
    const contentHeight = Math.max(nameLines.length * lineHeight, 28);
    const rowHeight = contentHeight + 22; // clean padding
    return {
      stt: index + 1,
      sku: r.id || '---',
      nameLines,
      quantity: r.quantity || 0,
      rowHeight
    };
  });

  const tableRowsHeight = rowDetails.reduce((sum, row) => sum + row.rowHeight, 0);

  // Height layout breakdown (loại bỏ phần ký tên rườm rà)
  const headerHeight = 100;
  const infoCardHeight = 90;
  const tableHeaderHeight = 44;
  const summaryBoxHeight = 72;
  const footerNoteHeight = 42;
  const verticalPadding = 36;

  const logicalHeight = verticalPadding + headerHeight + infoCardHeight + tableHeaderHeight + tableRowsHeight + summaryBoxHeight + footerNoteHeight + verticalPadding;

  // Real canvas creation with 2x resolution
  const canvas = document.createElement('canvas');
  canvas.width = logicalWidth * scale;
  canvas.height = logicalHeight * scale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Enable crisp font antialiasing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Background (Clean soft white / paper feel)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  // 2. Top Accent Ribbon (Clean royal blue gradient)
  const topGrad = ctx.createLinearGradient(0, 0, logicalWidth, 0);
  topGrad.addColorStop(0, '#1d4ed8');
  topGrad.addColorStop(0.5, '#2563eb');
  topGrad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, logicalWidth, 8);

  let currentY = 36;

  // 3. Header Section: Clean & Direct
  // Main Title: PHIẾU ĐẶT HÀNG
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('PHIẾU ĐẶT HÀNG', 32, currentY + 4);

  // Badge: Đợt đặt hàng #...
  const batchText = `ĐỢT ĐẶT HÀNG #${orderNumber}`;
  ctx.font = '800 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const badgeWidth = ctx.measureText(batchText).width + 24;
  const badgeX = logicalWidth - 32 - badgeWidth;
  
  // Badge background
  ctx.fillStyle = '#eff6ff';
  roundRect(ctx, badgeX, currentY - 22, badgeWidth, 34, 10);
  ctx.fill();
  ctx.strokeStyle = '#bfdbfe';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Badge text
  ctx.fillStyle = '#1d4ed8';
  ctx.fillText(batchText, badgeX + 12, currentY);

  currentY += 28;

  // Subtle separator line
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, currentY);
  ctx.lineTo(logicalWidth - 32, currentY);
  ctx.stroke();

  currentY += 14;

  // 4. Info Card (Metadata Box: Trực quan, gọn gàng, không rườm rà)
  const infoBoxX = 32;
  const infoBoxW = logicalWidth - 64;
  const infoBoxH = 82;

  ctx.fillStyle = '#f8fafc';
  roundRect(ctx, infoBoxX, currentY, infoBoxW, infoBoxH, 14);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  const timeInfo = formatOrderDateTime(order.createdAt);
  const totalItemsCount = order.records.length;
  const totalQuantitySum = order.records.reduce((acc, r) => acc + (r.quantity || 0), 0);
  const orderCreatorName = order.creatorName || order.userId || 'Người dùng';

  // Info Column 1 (Left): Thời gian tạo & Người lập phiếu
  const col1X = infoBoxX + 22;
  let infoY = currentY + 28;

  // Label: Thời gian tạo phiếu
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Thời gian tạo:', col1X, infoY);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(timeInfo.full, col1X + 110, infoY);

  infoY += 30;

  // Label: Người lập phiếu
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Người lập phiếu:', col1X, infoY);
  ctx.fillStyle = '#1d4ed8';
  ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(orderCreatorName, col1X + 110, infoY);

  // Info Column 2 (Right): Tổng loại mặt hàng & Tổng số lượng đặt
  const col2X = infoBoxX + 460;
  infoY = currentY + 28;

  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Tổng mặt hàng:', col2X, infoY);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${totalItemsCount} mặt hàng`, col2X + 130, infoY);

  infoY += 30;

  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Tổng số lượng đặt:', col2X, infoY);
  ctx.fillStyle = '#16a34a';
  ctx.font = '900 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${totalQuantitySum}`, col2X + 130, infoY);

  currentY += infoBoxH + 20;

  // 5. Table Section Header
  const tableX = 32;
  const tableW = logicalWidth - 64;

  // Table header background (Dark slate clean)
  ctx.fillStyle = '#1e293b';
  roundTopRect(ctx, tableX, currentY, tableW, tableHeaderHeight, 10);
  ctx.fill();

  // Column header labels
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  let headerX = tableX;

  // STT
  ctx.textAlign = 'center';
  ctx.fillText('STT', headerX + colWidths.stt / 2, currentY + 27);
  headerX += colWidths.stt;

  // Mã SP
  ctx.textAlign = 'left';
  ctx.fillText('MÃ SẢN PHẨM', headerX + 12, currentY + 27);
  headerX += colWidths.sku;

  // Tên sản phẩm
  ctx.fillText('TÊN SẢN PHẨM / VẬT TƯ ĐẶT HÀNG', headerX + 14, currentY + 27);
  headerX += colWidths.name;

  // Số lượng
  ctx.textAlign = 'center';
  ctx.fillText('SỐ LƯỢNG', headerX + colWidths.qty / 2, currentY + 27);

  currentY += tableHeaderHeight;

  // 6. Table Rows
  rowDetails.forEach((row, idx) => {
    const isEven = idx % 2 === 0;
    const isLast = idx === rowDetails.length - 1;

    // Row Background (Zebra Striping)
    ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
    if (isLast) {
      roundBottomRect(ctx, tableX, currentY, tableW, row.rowHeight, 10);
      ctx.fill();
    } else {
      ctx.fillRect(tableX, currentY, tableW, row.rowHeight);
    }

    // Row Bottom Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tableX, currentY + row.rowHeight);
    ctx.lineTo(tableX + tableW, currentY + row.rowHeight);
    ctx.stroke();

    let cellX = tableX;
    const centerY = currentY + row.rowHeight / 2;

    // 1. STT
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${row.stt}`, cellX + colWidths.stt / 2, centerY + 5);
    cellX += colWidths.stt;

    // 2. Mã SP (SKU / Code)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '700 13px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
    ctx.fillText(row.sku, cellX + 12, centerY + 5);
    cellX += colWidths.sku;

    // 3. Tên sản phẩm (To, rõ ràng, căn dòng thoáng)
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const totalLinesH = row.nameLines.length * 22;
    let nameLineY = centerY - totalLinesH / 2 + 14;
    row.nameLines.forEach((line) => {
      ctx.fillText(line, cellX + 14, nameLineY);
      nameLineY += 22;
    });
    cellX += colWidths.name;

    // 4. Số lượng (Highlighted badge to rõ)
    ctx.textAlign = 'center';
    const qtyBadgeW = 72;
    const qtyBadgeH = 30;
    const qtyBadgeX = cellX + (colWidths.qty - qtyBadgeW) / 2;
    const qtyBadgeY = centerY - qtyBadgeH / 2;

    ctx.fillStyle = '#eff6ff';
    roundRect(ctx, qtyBadgeX, qtyBadgeY, qtyBadgeW, qtyBadgeH, 8);
    ctx.fill();
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#1d4ed8';
    ctx.font = '900 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${row.quantity}`, qtyBadgeX + qtyBadgeW / 2, centerY + 5);

    currentY += row.rowHeight;
  });

  // Table Outer Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  roundRect(ctx, tableX, currentY - tableRowsHeight - tableHeaderHeight, tableW, tableRowsHeight + tableHeaderHeight, 10);
  ctx.stroke();

  currentY += 18;

  // 7. Summary Highlight Card (TỔNG CỘNG ĐẶT HÀNG)
  const sumCardH = 64;
  ctx.fillStyle = '#f8fafc';
  roundRect(ctx, tableX, currentY, tableW, sumCardH, 12);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Summary labels
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1e293b';
  ctx.font = '800 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('TỔNG CỘNG ĐẶT HÀNG:', tableX + 24, currentY + 37);

  ctx.fillStyle = '#64748b';
  ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`(${totalItemsCount} mặt hàng)`, tableX + 225, currentY + 37);

  // Big bold total quantity
  ctx.textAlign = 'right';
  ctx.fillStyle = '#475569';
  ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Tổng số lượng đặt:', tableX + tableW - 130, currentY + 37);

  ctx.fillStyle = '#2563eb';
  ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${totalQuantitySum}`, tableX + tableW - 24, currentY + 39);

  currentY += sumCardH + 24;

  // 8. Clean, simple footer (Hoàn toàn bỏ phần ký tên rườm rà)
  const now = new Date();
  const exportTimeStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN');

  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`Phiếu đặt hàng #${orderNumber} • Tạo lúc: ${timeInfo.full} • Xuất ảnh lúc: ${exportTimeStr}`, logicalWidth / 2, currentY);

  // Return generated blob and dataUrl
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas to blob failed'));
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      resolve({
        blob,
        dataUrl,
        width: canvas.width,
        height: canvas.height
      });
    }, 'image/png');
  });
}

// Helpers for rounded rectangles on canvas
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundTopRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundBottomRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y);
  ctx.closePath();
}

/**
 * Format order records as formatted text for quick copying
 */
export function formatOrderAsText(order: ConsumableOrder, orderNumber: number | string): string {
  const timeInfo = formatOrderDateTime(order.createdAt);
  const totalQty = order.records.reduce((acc, r) => acc + (r.quantity || 0), 0);
  const creator = order.creatorName || order.userId || 'Người dùng';

  let text = `📦 PHIẾU ĐẶT HÀNG #${orderNumber}\n`;
  text += `⏰ Thời gian tạo: ${timeInfo.full}\n`;
  text += `👤 Người lập phiếu: ${creator}\n`;
  text += `📋 Tổng mặt hàng: ${order.records.length} món | Tổng SL: ${totalQty}\n`;
  text += `------------------------------------\n`;
  text += `DANH SÁCH CHI TIẾT:\n`;

  order.records.forEach((r, idx) => {
    text += `${idx + 1}. [${r.id}] ${r.name} ➔ SL: ${r.quantity}\n`;
  });

  text += `------------------------------------\n`;
  text += `⚡ Tổng số lượng: ${totalQty}\n`;
  return text;
}
