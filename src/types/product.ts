import { RefObject } from 'react';

export interface ExpiryRecord {
  id: string;
  expDate: string;
  destructionDate: string;
  quantity?: number;
  note?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  sku?: string;
  internalCode?: string;
  price: number;
  expireDate?: string | null;
  destructionDate?: string;
  destroyDaysBeforeExpiry?: number;
  imageUrl?: string;
  quantity?: number;
  category?: string;
  expiryRecords?: ExpiryRecord[];
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  priceTagImageUrl?: string;
  status?: string;
  createdBy?: string;
  [key: string]: any;
}

export interface ProductData {
  name: string;
  price: number;
  barcode: string;
  daysBeforeExpiry: number;
  internalCode: string;
  imageUrl?: string;
}

export interface BarcodeScannerState {
  videoRef: RefObject<HTMLVideoElement | null>;
  barcode: string | null;
  scanning: boolean;
  error: string | null;
  startScan: () => Promise<void>;
  stopScan: () => void;
  setBarcode: (value: string | null) => void;
}

export interface BarcodeSearchState {
  product: Product | null;
  loading: boolean;
  error: string | null;
  searchByBarcode: (barcode: string) => Promise<void>;
}
