import { Product, ExpiryRecord } from './firestoreService';

export function formatDate(d: string | undefined | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function parseDateSafe(d: string | undefined | null): Date | null {
  if (!d) return null;
  const s = String(d).trim();
  if (!s || s.startsWith('00') || s.includes('1900') || s.includes('1999') || s.includes('2000') || s.includes('2001')) return null;
  
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let year = 0, month = 0, day = 0;
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    }
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const parsed = new Date(year, month, day);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

export function calculateDestructionDate(expDate: string, daysBefore: number): string {
  if (!expDate) return '';
  const d = parseDateSafe(expDate);
  if (!d) return '';
  d.setDate(d.getDate() - (Number(daysBefore) || 0));
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getStatus(d: string | undefined | null) {
  if (!d) return { 
    cls: 'bg-zinc-900', 
    badgeCls: 'bg-zinc-100 text-zinc-700 border-zinc-200', 
    txt: '-', 
    shortTxt: '-',
    days: 999, 
    isExpired: false, 
    isNear: false 
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseDateSafe(d) || new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { 
      cls: 'bg-red-600', 
      badgeCls: 'bg-red-50 text-red-700 border-red-200',
      txt: `Quá hạn hủy ${Math.abs(diffDays)} ngày`,
      shortTxt: `Quá ${Math.abs(diffDays)} ngày`,
      days: diffDays,
      isExpired: true,
      isNear: false
    };
  }
  if (diffDays <= 7) {
    return { 
      cls: 'bg-amber-500', 
      badgeCls: 'bg-amber-50 text-amber-800 border-amber-200',
      txt: diffDays === 0 ? 'Hủy hôm nay' : `Cần hủy trong ${diffDays} ngày`,
      shortTxt: diffDays === 0 ? 'Hôm nay' : `Còn ${diffDays} ngày`,
      days: diffDays,
      isExpired: false,
      isNear: true
    };
  }
  return { 
    cls: 'bg-emerald-600', 
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    txt: `Còn ${diffDays} ngày`,
    shortTxt: `Còn ${diffDays} ngày`,
    days: diffDays,
    isExpired: false,
    isNear: false
  };
}

export function isValidRealExpiryDate(d: string | undefined | null): boolean {
  const dt = parseDateSafe(d);
  if (!dt) return false;
  const year = dt.getFullYear();
  return year >= 2024 && year <= 2040;
}

export function getProductRecords(product: Product): ExpiryRecord[] {
  let list: ExpiryRecord[] = [];
  if (product.expiryRecords && product.expiryRecords.length > 0) {
    list = product.expiryRecords.filter(r => isValidRealExpiryDate(r.destructionDate));
  } else if (product.destructionDate && isValidRealExpiryDate(product.destructionDate)) {
    list = [{
      id: 'rec-' + (product.id || 'default'),
      expDate: product.destructionDate,
      destructionDate: product.destructionDate,
      createdAt: new Date().toISOString()
    }];
  }
  return list.sort((a, b) => new Date(a.destructionDate).getTime() - new Date(b.destructionDate).getTime());
}

export function getEarliestDestructionDate(product: Product): string {
  const records = getProductRecords(product);
  if (records.length === 0) return (product.destructionDate && isValidRealExpiryDate(product.destructionDate)) ? product.destructionDate : '';
  return records[0].destructionDate;
}
