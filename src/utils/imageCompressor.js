/**
 * Mobile-optimized Image Compression Utility
 * Resizes phone camera photos to lightweight, sharp images suitable for offline storage and PDF embedding.
 */

export function compressImage(file, maxDimension = 1280, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Invalid image file'));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Export as compressed JPEG
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        
        resolve({
          id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          dataUrl: compressedDataUrl,
          name: file.name,
          timestamp: new Date().toISOString(),
          size: Math.round(compressedDataUrl.length * 3 / 4) // approximate bytes
        });
      };
      img.onerror = () => reject(new Error('Failed to load image into memory'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
