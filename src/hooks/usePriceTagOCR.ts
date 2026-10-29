import { useState, useCallback } from 'react';
import { ProductData } from '../types/product';

export interface PriceTagOCRResult {
  productData: ProductData | null;
  loading: boolean;
  error: string | null;
  confidence: number;
  analyzeImage: (imageSource: string | File, fallbackBarcode?: string) => Promise<ProductData | null>;
  resetOCR: () => void;
}

/**
 * Normalizes text lines and cleans up OCR noise
 */
const cleanText = (text: string): string => {
  return text
    .replace(/\r/g, '\n')
    .replace(/[|]/g, ' ')
    .trim();
};

export const usePriceTagOCR = (): PriceTagOCRResult => {
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0);

  const resetOCR = useCallback(() => {
    setProductData(null);
    setLoading(false);
    setError(null);
    setConfidence(0);
  }, []);

  const analyzeImage = useCallback(async (imageSource: string | File, fallbackBarcode?: string): Promise<ProductData | null> => {
    setLoading(true);
    setError(null);
    setProductData(null);
    setConfidence(0);

    let imageUri = '';
    let isObjectUrl = false;

    // Set 15s timeout
    let timedOut = false;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      setError('Quá thời gian phân tích (15s). Vui lòng chụp rõ nét hơn.');
    }, 15000);

    try {
      if (typeof imageSource === 'string') {
        imageUri = imageSource;
      } else if (imageSource instanceof File) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!validTypes.includes(imageSource.type.toLowerCase())) {
          throw new Error('Không thể đọc ảnh. Vui lòng sử dụng JPG, PNG hoặc WebP.');
        }
        if (imageSource.size > 5 * 1024 * 1024) {
          throw new Error('File quá lớn. Tối đa 5MB.');
        }
        imageUri = URL.createObjectURL(imageSource);
        isObjectUrl = true;
      } else {
        throw new Error('Dữ liệu ảnh không hợp lệ.');
      }

      // Lazy import Tesseract
      const { createWorker } = await import('tesseract.js');
      if (timedOut) return null;

      // Initialize worker with Vietnamese + English for best accuracy on accents & numbers
      const worker = await createWorker(['vie', 'eng']);
      if (timedOut) {
        await worker.terminate();
        return null;
      }

      const ret = await worker.recognize(imageUri);
      await worker.terminate();

      if (timedOut) return null;

      const rawText = cleanText(ret.data.text);
      const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

      if (lines.length === 0) {
        throw new Error('Ảnh không rõ hoặc không nhận diện được chữ. Vui lòng chụp sắc nét hơn.');
      }

      // ==========================================
      // REGEX PARSING FOR VIETNAMESE PRICE TAGS
      // ==========================================
      // Patterns:
      // Price: 19,000 VND, 19.000 VND, 19000 VND, 19,000VND, 19.000đ, 19000d
      const priceRegex = /(\d{1,3}(?:[.,]\d{3})+|\d{4,7})\s*(?:VND|VNĐ|Đ|d|vd)?/i;
      // Barcode: 13 digits
      const barcodeRegex = /\b(\d{13})\b/;
      // H-number (days before expiry): H-2, H - 2, H2, H: 2
      const hRegex = /H\s*[-:]?\s*(\d{1,2})/i;
      // Internal code: 6 digits (e.g., 240810)
      const internalCodeRegex = /\b(\d{6})\b/;

      let extractedPrice = 0;
      let extractedBarcode = fallbackBarcode || '';
      let extractedDaysBefore = 2; // Default reasonable fallback
      let extractedInternalCode = '';
      const nameCandidates: string[] = [];

      let matchedFieldsCount = 0;

      // Search across all text lines
      for (const line of lines) {
        // Check for price
        if (!extractedPrice) {
          const priceMatch = line.match(priceRegex);
          if (priceMatch && priceMatch[1]) {
            const numStr = priceMatch[1].replace(/[.,]/g, '');
            const parsed = parseInt(numStr, 10);
            if (!isNaN(parsed) && parsed >= 500 && parsed <= 50000000) {
              extractedPrice = parsed;
              matchedFieldsCount++;
              continue;
            }
          }
        }

        // Check for barcode
        if (!extractedBarcode || extractedBarcode === fallbackBarcode) {
          const barcodeMatch = line.match(barcodeRegex);
          if (barcodeMatch && barcodeMatch[1]) {
            extractedBarcode = barcodeMatch[1];
            matchedFieldsCount++;
            continue;
          }
        }

        // Check for H-number (days before expiry)
        const hMatch = line.match(hRegex);
        if (hMatch && hMatch[1]) {
          const hVal = parseInt(hMatch[1], 10);
          if (hVal > 0 && hVal <= 30) {
            extractedDaysBefore = hVal;
            matchedFieldsCount++;
            continue;
          }
        }

        // Check for 6-digit internal code
        if (!extractedInternalCode) {
          const intMatch = line.match(internalCodeRegex);
          if (intMatch && intMatch[1] && intMatch[1] !== extractedBarcode.slice(0, 6)) {
            extractedInternalCode = intMatch[1];
            matchedFieldsCount++;
            continue;
          }
        }

        // Potential product name lines: exclude lines that look like pure numbers or barcode
        const cleanLine = line.replace(/[^a-zA-Z0-9\sáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđĐ]/g, '').trim();
        if (cleanLine.length >= 3 && !/^\d+$/.test(cleanLine) && !cleanLine.toLowerCase().includes('vnd')) {
          nameCandidates.push(line.trim());
        }
      }

      // If price wasn't found line by line, try global text search
      if (!extractedPrice) {
        const fullPriceMatch = rawText.match(priceRegex);
        if (fullPriceMatch && fullPriceMatch[1]) {
          const parsed = parseInt(fullPriceMatch[1].replace(/[.,]/g, ''), 10);
          if (!isNaN(parsed) && parsed >= 500) {
            extractedPrice = parsed;
            matchedFieldsCount++;
          }
        }
      }

      // If barcode wasn't found, try global search or use fallback barcode
      if (!extractedBarcode) {
        const fullBarcodeMatch = rawText.match(barcodeRegex);
        if (fullBarcodeMatch && fullBarcodeMatch[1]) {
          extractedBarcode = fullBarcodeMatch[1];
          matchedFieldsCount++;
        } else if (fallbackBarcode) {
          extractedBarcode = fallbackBarcode;
        }
      }

      // If internal code wasn't found, check all 6-digit tokens
      if (!extractedInternalCode) {
        const all6Digits = rawText.match(/\b\d{6}\b/g);
        if (all6Digits && all6Digits.length > 0) {
          extractedInternalCode = all6Digits[0];
          matchedFieldsCount++;
        }
      }

      // Product Name: concatenate top 1-2 candidate lines before price
      let extractedName = nameCandidates.slice(0, 2).join(' ').trim();
      if (!extractedName && lines.length > 0) {
        extractedName = lines[0];
      }
      if (extractedName) {
        matchedFieldsCount++;
      }

      // Calculate confidence percentage (0 - 100)
      let calcConfidence = Math.min(
        100,
        Math.round((matchedFieldsCount / 5) * 80 + (ret.data.confidence ? ret.data.confidence * 0.2 : 15))
      );

      // If barcode is 13 digits and price found, boost confidence
      if (extractedBarcode.length === 13 && extractedPrice > 0) {
        calcConfidence = Math.max(calcConfidence, 85);
      }

      const finalProductData: ProductData = {
        name: extractedName || 'Sản phẩm mới',
        price: extractedPrice || 0,
        barcode: extractedBarcode || fallbackBarcode || '',
        daysBeforeExpiry: extractedDaysBefore,
        internalCode: extractedInternalCode || (extractedBarcode.length >= 6 ? extractedBarcode.slice(-6) : '')
      };

      setProductData(finalProductData);
      setConfidence(calcConfidence);
      setLoading(false);
      return finalProductData;
    } catch (err: any) {
      if (timedOut) return null;
      console.error('Price tag OCR error:', err);
      const msg = err.message || 'Không phát hiện bảng giá. Vui lòng chụp lại rõ nét hơn.';
      setError(msg);
      setLoading(false);
      return null;
    } finally {
      clearTimeout(timeoutTimer);
      if (isObjectUrl && imageUri) {
        URL.revokeObjectURL(imageUri);
      }
    }
  }, []);

  return {
    productData,
    loading,
    error,
    confidence,
    analyzeImage,
    resetOCR
  };
};
