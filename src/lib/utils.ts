import { Product, ExpiryRecord } from './firestoreService';

export function formatDate(d: string | undefined | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function calculateDestructionDate(expDate: string, daysBefore: number): string {
  if (!expDate) return '';
  const d = new Date(expDate);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() - (Number(daysBefore) || 0));
  return d.toISOString().split('T')[0];
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
  const today = new Date(), target = new Date(d);
  today.setHours(0, 0, 0, 0);
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

export function getProductRecords(product: Product): ExpiryRecord[] {
  if (product.expiryRecords && product.expiryRecords.length > 0) {
    return [...product.expiryRecords].sort((a, b) => new Date(a.destructionDate).getTime() - new Date(b.destructionDate).getTime());
  }
  if (product.destructionDate) {
    return [{
      id: 'rec-' + (product.id || 'default'),
      expDate: product.destructionDate,
      destructionDate: product.destructionDate,
      createdAt: new Date().toISOString()
    }];
  }
  return [];
}

export function getEarliestDestructionDate(product: Product): string {
  const records = getProductRecords(product);
  if (records.length === 0) return product.destructionDate || '';
  return records[0].destructionDate;
}
