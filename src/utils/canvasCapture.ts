import { RefObject } from 'react';

/**
 * Captures a video frame from an HTMLVideoElement and returns a Base64 JPEG data URL.
 * Handles video orientation, ready state, and aspect ratio.
 */
export const captureVideoFrame = (
  videoRef: RefObject<HTMLVideoElement | null>
): string | null => {
  if (!videoRef.current) return null;
  const video = videoRef.current;

  // Ensure video has loaded valid dimensions
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

    // Return high quality JPEG
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (err) {
    console.error('Failed to capture video frame onto canvas:', err);
    return null;
  }
};

/**
 * Converts a File object (JPG, PNG, WebP) to a Base64 data URL string.
 */
export const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không thể đọc file ảnh dưới dạng base64.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Lỗi khi đọc file ảnh.'));
    reader.readAsDataURL(file);
  });
};
