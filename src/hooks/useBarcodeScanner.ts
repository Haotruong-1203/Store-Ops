import { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BarcodeScannerState } from '../types/product';

const AUTOFOCUS_INTERVAL_MS = 300;

export const stopAllCameraMediaTracks = () => {
  try {
    document.querySelectorAll('video').forEach((v) => {
      if (v.srcObject) {
        try {
          const stream = v.srcObject as MediaStream;
          stream.getTracks().forEach((track) => {
            track.stop();
            track.enabled = false;
          });
          v.srcObject = null;
          v.pause();
          v.removeAttribute('src');
        } catch (e) {
          console.warn('Lỗi khi dừng video track:', e);
        }
      }
    });
  } catch (err) {
    console.warn('Lỗi khi ngắt tất cả camera tracks:', err);
  }
};

const pulseVideoTrackAutofocus = async (
  track: MediaStreamTrack,
  stepIndex: number,
  point: { x: number; y: number } = { x: 0.5, y: 0.5 }
) => {
  if (!track || track.readyState !== 'live' || typeof track.applyConstraints !== 'function') {
    return;
  }

  try {
    const capabilities: any = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    const supportedModes: string[] = Array.isArray(capabilities?.focusMode) ? capabilities.focusMode : [];

    const advancedConstraint: Record<string, any> = {};

    if (supportedModes.length > 0) {
      if (supportedModes.includes('single-shot') && supportedModes.includes('continuous')) {
        advancedConstraint.focusMode = stepIndex % 2 === 0 ? 'continuous' : 'single-shot';
      } else if (supportedModes.includes('continuous')) {
        advancedConstraint.focusMode = 'continuous';
      } else if (supportedModes.includes('single-shot')) {
        advancedConstraint.focusMode = 'single-shot';
      } else if (supportedModes.includes('auto')) {
        advancedConstraint.focusMode = 'auto';
      }
    } else {
      advancedConstraint.focusMode = stepIndex % 2 === 0 ? 'continuous' : 'single-shot';
    }

    if (capabilities?.pointsOfInterest) {
      advancedConstraint.pointsOfInterest = [point];
    }

    await track.applyConstraints({
      advanced: [advancedConstraint as any]
    });
  } catch {
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' } as any]
      });
    } catch {}
  }
};

export const useBarcodeScanner = (
  onDetected?: (barcode: string) => void
): BarcodeScannerState => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const focusIntervalRef = useRef<number | null>(null);
  const focusStepRef = useRef<number>(0);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeDetectorRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const onDetectedRef = useRef<((barcode: string) => void) | undefined>(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const [barcode, setBarcode] = useState<string | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearAutofocusLoop = useCallback(() => {
    if (focusIntervalRef.current !== null) {
      window.clearInterval(focusIntervalRef.current);
      focusIntervalRef.current = null;
    }
  }, []);

  const createZxingReader = useCallback(() => {
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
    return new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 300
    });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    readerRef.current = createZxingReader();

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const DetectorClass = (window as any).BarcodeDetector;
        nativeDetectorRef.current = new DetectorClass({
          formats: [
            'ean_13',
            'ean_8',
            'code_128',
            'code_39',
            'upc_a',
            'upc_e',
            'itf',
            'qr_code'
          ]
        });
      } catch {
        nativeDetectorRef.current = null;
      }
    }

    return () => {
      isMountedRef.current = false;
      clearAutofocusLoop();
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {}
        controlsRef.current = null;
      }
      readerRef.current = null;
    };
  }, [clearAutofocusLoop, createZxingReader]);

  const emitDetectedBarcode = useCallback((rawText: string) => {
    const clean = (rawText || '').trim();
    if (!clean || !isMountedRef.current) return;
    if (navigator.vibrate) {
      try {
        navigator.vibrate(100);
      } catch {}
    }
    setBarcode(clean);
    if (onDetectedRef.current) {
      onDetectedRef.current(clean);
    }
  }, []);

  const startAutofocusAndEnhanceLoop = useCallback(() => {
    clearAutofocusLoop();
    focusStepRef.current = 0;

    focusIntervalRef.current = window.setInterval(async () => {
      if (!isMountedRef.current) {
        clearAutofocusLoop();
        return;
      }

      const videoEl = videoRef.current;
      const activeStream =
        streamRef.current ||
        (videoEl?.srcObject instanceof MediaStream ? (videoEl.srcObject as MediaStream) : null);

      if (!activeStream) return;

      const videoTracks = activeStream.getVideoTracks();
      if (videoTracks.length > 0) {
        focusStepRef.current += 1;
        await pulseVideoTrackAutofocus(videoTracks[0], focusStepRef.current);
      }

      if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) {
        return;
      }

      try {
        if (nativeDetectorRef.current) {
          const directResults = await nativeDetectorRef.current.detect(videoEl);
          if (directResults && directResults.length > 0 && directResults[0].rawValue) {
            emitDetectedBarcode(String(directResults[0].rawValue));
            return;
          }
        }
      } catch {}

      try {
        if (!roiCanvasRef.current) {
          roiCanvasRef.current = document.createElement('canvas');
        }
        const canvas = roiCanvasRef.current;
        const vw = videoEl.videoWidth;
        const vh = videoEl.videoHeight;
        const cropW = Math.floor(vw * 0.8);
        const cropH = Math.floor(vh * 0.55);
        const sx = Math.floor((vw - cropW) / 2);
        const sy = Math.floor((vh - cropH) / 2);

        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.filter = 'contrast(1.35) brightness(1.04)';
        ctx.drawImage(videoEl, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

        if (nativeDetectorRef.current) {
          const croppedResults = await nativeDetectorRef.current.detect(canvas);
          if (croppedResults && croppedResults.length > 0 && croppedResults[0].rawValue) {
            emitDetectedBarcode(String(croppedResults[0].rawValue));
            return;
          }
        }

        if (readerRef.current) {
          const zxingRes = readerRef.current.decodeFromCanvas(canvas);
          if (zxingRes && zxingRes.getText()) {
            emitDetectedBarcode(zxingRes.getText());
          }
        }
      } catch {}
    }, AUTOFOCUS_INTERVAL_MS);
  }, [clearAutofocusLoop, emitDetectedBarcode]);

  const stopScan = useCallback(() => {
    isMountedRef.current = false;
    clearAutofocusLoop();

    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch (e) {
        console.warn('Lỗi khi dừng scanner controls:', e);
      }
      controlsRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (e) {
        console.warn('Lỗi khi dừng stream tracks:', e);
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        try {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => {
            track.stop();
            track.enabled = false;
          });
        } catch (e) {
          console.warn('Lỗi khi dừng video tracks:', e);
        }
        videoRef.current.srcObject = null;
      }
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
      } catch {}
    }

    stopAllCameraMediaTracks();
    setScanning(false);
  }, [clearAutofocusLoop]);

  const startScan = useCallback(async () => {
    isMountedRef.current = true;
    setError(null);
    setBarcode(null);
    clearAutofocusLoop();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Thiết bị này không hỗ trợ quét mã vạch hoặc camera.');
      return;
    }

    if (!readerRef.current) {
      readerRef.current = createZxingReader();
    }

    try {
      const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!isMountedRef.current) return;

      if (!videoInputDevices || videoInputDevices.length === 0) {
        setError('Không tìm thấy camera trên thiết bị.');
        return;
      }

      const backCamera = videoInputDevices.find(
        (device) =>
          device.label.toLowerCase().includes('back') ||
          device.label.toLowerCase().includes('rear') ||
          device.label.toLowerCase().includes('sau') ||
          device.label.toLowerCase().includes('environment')
      );
      const selectedDeviceId = backCamera ? backCamera.deviceId : videoInputDevices[0].deviceId;

      setScanning(true);

      if (videoRef.current) {
        const decodeCallback = (result: any, err: any) => {
          if (result) {
            emitDetectedBarcode(result.getText());
          }
          if (err && !(err.name === 'NotFoundException')) {
            return;
          }
        };

        let controls: IScannerControls;
        try {
          const constraints: MediaStreamConstraints = {
            video: {
              ...(selectedDeviceId ? { deviceId: { ideal: selectedDeviceId } } : {}),
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              advanced: [{ focusMode: 'continuous' } as any]
            }
          };
          controls = await readerRef.current.decodeFromConstraints(
            constraints,
            videoRef.current,
            decodeCallback
          );
        } catch {
          controls = await readerRef.current.decodeFromVideoDevice(
            selectedDeviceId,
            videoRef.current,
            decodeCallback
          );
        }

        if (!isMountedRef.current) {
          try {
            controls.stop();
          } catch {}
          if (videoRef.current?.srcObject) {
            try {
              (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => {
                t.stop();
                t.enabled = false;
              });
              videoRef.current.srcObject = null;
            } catch {}
          }
          stopAllCameraMediaTracks();
          return;
        }

        controlsRef.current = controls;

        if (videoRef.current?.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          streamRef.current = stream;
          const tracks = stream.getVideoTracks();
          if (tracks.length > 0) {
            await pulseVideoTrackAutofocus(tracks[0], 0);
          }
        }

        startAutofocusAndEnhanceLoop();
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
  }, [clearAutofocusLoop, createZxingReader, emitDetectedBarcode, startAutofocusAndEnhanceLoop, stopScan]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !scanning) return;

    const handleVideoTap = (e: MouseEvent) => {
      const activeStream =
        streamRef.current ||
        (videoEl.srcObject instanceof MediaStream ? (videoEl.srcObject as MediaStream) : null);
      if (!activeStream) return;
      const tracks = activeStream.getVideoTracks();
      if (tracks.length === 0) return;

      const rect = videoEl.getBoundingClientRect();
      const x = rect.width > 0 ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0.5;
      const y = rect.height > 0 ? Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) : 0.5;
      focusStepRef.current += 1;
      pulseVideoTrackAutofocus(tracks[0], focusStepRef.current, { x, y });
    };

    videoEl.addEventListener('click', handleVideoTap);
    return () => {
      videoEl.removeEventListener('click', handleVideoTap);
    };
  }, [scanning]);

  useEffect(() => {
    isMountedRef.current = true;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopScan();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', stopScan);

    return () => {
      isMountedRef.current = false;
      clearAutofocusLoop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', stopScan);
      stopScan();
      stopAllCameraMediaTracks();
    };
  }, [clearAutofocusLoop, stopScan]);

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
