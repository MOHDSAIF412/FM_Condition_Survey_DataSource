// Display-only preview. Original evidence stays in storage and report exports.
export async function photoThumbnail(source) {
  if (typeof Image === 'undefined') return source;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale === 1) { resolve(source); return; }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .8));
      } catch { resolve(source); }
    };
    img.onerror = () => resolve(source);
    img.src = source;
  });
}
