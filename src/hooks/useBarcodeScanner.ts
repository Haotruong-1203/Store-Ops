import { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BarcodeScannerState } from '../types/product';

export const useBarcodeScanner = (
  onDetected?: (barcode: string) => void
): BarcodeScannerState => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [barcode, setBarcode] = useState<string | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize ZXing reader with barcode formats
  useEffect(() => {
    const hints = new Map<DecodeHintType, any>();
    // Support common retail 1D & 2D formats
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

    readerRef.current = new BrowserMultiFormatReader(hints);

    return () => {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      readerRef.current = null;
    };
  }, []);

  const stopScan = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch (e) {
        console.warn('Error stopping scanner controls:', e);
      }
      controlsRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    setScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    setError(null);
    setBarcode(null);

    // Verify browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Thiết bị này không hỗ trợ quét mã vạch hoặc camera.');
      return;
    }

    if (!readerRef.current) {
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
      readerRef.current = new BrowserMultiFormatReader(hints);
    }

    try {
      // List video devices
      const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!videoInputDevices || videoInputDevices.length === 0) {
        setError('Không tìm thấy camera trên thiết bị.');
        return;
      }

      // Prioritize environment/back camera if available
      const backCamera = videoInputDevices.find(
        (device) =>
          device.label.toLowerCase().includes('back') ||
          device.label.toLowerCase().includes('rear') ||
          device.label.toLowerCase().includes('sau') ||
          device.label.toLowerCase().includes('environment')
      );
      const selectedDeviceId = backCamera ? backCamera.deviceId : videoInputDevices[0].deviceId;

      setScanning(true);

      // Start decoding from video device
      if (videoRef.current) {
        const controls = await readerRef.current.decodeFromVideoDevice(
          selectedDeviceId,
          videoRef.current,
          (result, err) => {
            if (result) {
              const text = result.getText();
              console.log('Barcode detected:', text);
              if (navigator.vibrate) {
                try {
                  navigator.vibrate(100);
                } catch {
                  // ignore
                }
              }
              setBarcode(text);
              if (onDetected) {
                onDetected(text);
              }
            }
            if (err && !(err.name === 'NotFoundException')) {
              // Non-critical frame decode error, only log if not NotFoundException
              // console.debug('Decode frame:', err.message);
            }
          }
        );

        controlsRef.current = controls;
      }
    } catch (err: any) {
      console.error('Failed to start scanner:', err);
      stopScan();

      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        err.message?.includes('Permission')
      ) {
        setError('Quyền truy cập camera bị từ chối. Vui lòng cho phép ứng dụng truy cập camera.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('Không tìm thấy camera trên thiết bị của bạn.');
      } else {
        setError('Lỗi khởi động camera: ' + (err.message || 'Lỗi không xác định.'));
      }
    }
  }, [onDetected, stopScan]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  return {
    videoRef,
    barcode,
    scanning,
    error,
    startScan,
    stopScan,
    setBarcode
  };
};
