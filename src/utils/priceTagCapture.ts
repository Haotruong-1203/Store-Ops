import { RefObject } from 'react';

/**
 * Captures a video frame from an HTMLVideoElement and returns a Base64 JPEG data URL.
 * Handles video orientation, ready state, and aspect ratio.
 */
export const capturePriceTagFrame = (
  videoRef: RefObject<HTMLVideoElement | null>
): string | null => {
  if (!videoRef.current) return null;
  const video = videoRef.current;

  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;

  if (!width || !height) {
    console.warn('Video not ready or has zero dimensions for frame capture.');
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch (err) {
    console.error('Failed to capture price tag frame onto canvas:', err);
    return null;
  }
};

/**
 * Validates and converts an uploaded file to Base64 JPEG string.
 */
export const uploadPriceTagImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      return reject(new Error('Không thể đọc ảnh. Vui lòng sử dụng JPG, PNG hoặc WebP.'));
    }

    if (file.size > 5 * 1024 * 1024) {
      return reject(new Error('File quá lớn. Tối đa 5MB.'));
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Lỗi khi đọc file ảnh.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Lỗi khi đọc file ảnh.'));
    reader.readAsDataURL(file);
  });
};
