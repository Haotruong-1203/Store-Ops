import { useState, useCallback, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

// Extend window for native BarcodeDetector if present
declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

export interface AnalyzeResult {
  barcode: string;
  format?: string;
  confidence?: number;
}

export interface BarcodeFromImageState {
  barcode: string | null;
  format: string | null;
  confidence: number | null;
  loading: boolean;
  error: string | null;
  analyzeImage: (imageSource: string | File) => Promise<AnalyzeResult | null>;
  resetAnalysis: () => void;
}

/**
 * Loads an HTMLImageElement from a Base64 data URI or Object URL.
 */
const loadImageElement = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Không thể tải dữ liệu ảnh để phân tích.'));
    img.src = src;
  });
};

/**
 * Creates pre-processed canvas variants (original, grayscale high-contrast, inverted)
 * to maximize decode rates on difficult lighting or reflection conditions.
 */
const createProcessedCanvases = (img: HTMLImageElement): HTMLCanvasElement[] => {
  const canvases: HTMLCanvasElement[] = [];
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  // 1. Original Canvas
  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = width;
  originalCanvas.height = height;
  const origCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
  if (origCtx) {
    origCtx.drawImage(img, 0, 0, width, height);
    canvases.push(originalCanvas);
  }

  // 2. High Contrast Grayscale Canvas
  const contrastCanvas = document.createElement('canvas');
  contrastCanvas.width = width;
  contrastCanvas.height = height;
  const contrastCtx = contrastCanvas.getContext('2d', { willReadFrequently: true });
  if (contrastCtx && origCtx) {
    const imgData = origCtx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const factor = (259 * (128 + 255)) / (255 * (259 - 128)); // contrast increase
    for (let i = 0; i < data.length; i += 4) {
      // Grayscale luminance
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Apply contrast
      const adjusted = factor * (gray - 128) + 128;
      const clamped = Math.min(255, Math.max(0, adjusted));
      data[i] = clamped;
      data[i + 1] = clamped;
      data[i + 2] = clamped;
    }
    contrastCtx.putImageData(imgData, 0, 0);
    canvases.push(contrastCanvas);
  }

  // 3. Cropped Center ROI Canvas (where users typically aim the camera)
  const centerCanvas = document.createElement('canvas');
  const cropW = Math.floor(width * 0.75);
  const cropH = Math.floor(height * 0.6);
  const cropX = Math.floor((width - cropW) / 2);
  const cropY = Math.floor((height - cropH) / 2);
  centerCanvas.width = cropW;
  centerCanvas.height = cropH;
  const centerCtx = centerCanvas.getContext('2d', { willReadFrequently: true });
  if (centerCtx) {
    centerCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    canvases.push(centerCanvas);
  }

  return canvases;
};

export const useBarcodeFromImage = (): BarcodeFromImageState => {
  const [barcode, setBarcode] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  const resetAnalysis = useCallback(() => {
    setBarcode(null);
    setFormat(null);
    setConfidence(null);
    setLoading(false);
    setError(null);
  }, []);

  const analyzeImage = useCallback(async (imageSource: string | File): Promise<AnalyzeResult | null> => {
    setLoading(true);
    setError(null);
    setBarcode(null);
    setFormat(null);
    setConfidence(null);

    let imageUri = '';
    let isObjectUrl = false;

    try {
      if (typeof imageSource === 'string') {
        imageUri = imageSource;
      } else if (imageSource instanceof File) {
        // Validate file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!validTypes.includes(imageSource.type.toLowerCase())) {
          throw new Error('Định dạng ảnh không hỗ trợ. Vui lòng dùng JPG, PNG hoặc WebP');
        }
        // Validate file size (max 5MB)
        if (imageSource.size > 5 * 1024 * 1024) {
          throw new Error('File quá lớn. Tối đa 5MB');
        }
        imageUri = URL.createObjectURL(imageSource);
        isObjectUrl = true;
      } else {
        throw new Error('Dữ liệu ảnh không hợp lệ.');
      }

      const imgElement = await loadImageElement(imageUri);

      // ==========================================
      // APPROACH A: Native BarcodeDetector API
      // ==========================================
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
          const targetFormats = [
            'ean_13',
            'ean_8',
            'upc_a',
            'upc_e',
            'code_128',
            'code_39',
            'code_93',
            'itf',
            'qr_code'
          ].filter(f => supportedFormats.includes(f));

          const detector = new window.BarcodeDetector({
            formats: targetFormats.length > 0 ? targetFormats : supportedFormats
          });

          const detectedBarcodes = await detector.detect(imgElement);
          if (detectedBarcodes && detectedBarcodes.length > 0) {
            const firstResult = detectedBarcodes[0];
            const rawValue = firstResult.rawValue?.trim();
            if (rawValue) {
              const res: AnalyzeResult = {
                barcode: rawValue,
                format: firstResult.format || 'BarcodeDetector',
                confidence: 0.95
              };
              setBarcode(res.barcode);
              setFormat(res.format || null);
              setConfidence(res.confidence || 0.95);
              setLoading(false);
              return res;
            }
          }
        } catch (nativeErr) {
          console.warn('Native BarcodeDetector attempt finished with no match, trying ZXing / filters:', nativeErr);
        }
      }

      // ==========================================
      // APPROACH B: ZXing with Multi-pass Canvas Filters
      // ==========================================
      if (!zxingReaderRef.current) {
        const hints = new Map<DecodeHintType, any>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        zxingReaderRef.current = new BrowserMultiFormatReader(hints);
      }

      const reader = zxingReaderRef.current;
      const canvases = createProcessedCanvases(imgElement);

      // Iterate through passes (original, enhanced contrast, center crop)
      for (let i = 0; i < canvases.length; i++) {
        try {
          const canvas = canvases[i];
          const decodeResult = reader.decodeFromCanvas(canvas);
          if (decodeResult) {
            const rawText = decodeResult.getText()?.trim();
            if (rawText) {
              const formatName = decodeResult.getBarcodeFormat()
                ? BarcodeFormat[decodeResult.getBarcodeFormat()]
                : 'ZXing';

              const res: AnalyzeResult = {
                barcode: rawText,
                format: formatName,
                confidence: i === 0 ? 0.9 : 0.8
              };

              setBarcode(res.barcode);
              setFormat(res.format || null);
              setConfidence(res.confidence || 0.85);
              setLoading(false);
              return res;
            }
          }
        } catch {
          // Next pass
        }
      }

      // If all passes failed
      const notFoundMessage = 'Không phát hiện mã vạch trong ảnh. Vui lòng đảm bảo mã vạch rõ nét, đủ ánh sáng và thử lại.';
      setError(notFoundMessage);
      setLoading(false);
      return null;
    } catch (err: any) {
      console.error('Barcode from image analysis error:', err);
      const msg = err.message || 'Lỗi khi phân tích ảnh. Vui lòng thử lại.';
      setError(msg);
      setLoading(false);
      return null;
    } finally {
      if (isObjectUrl && imageUri) {
        URL.revokeObjectURL(imageUri);
      }
    }
  }, []);

  return {
    barcode,
    format,
    confidence,
    loading,
    error,
    analyzeImage,
    resetAnalysis
  };
};
