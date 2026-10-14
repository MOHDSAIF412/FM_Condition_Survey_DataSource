import React, { useEffect, useRef, useState } from 'react';
import { downloadPhoto } from '../utils/cloudSync';

// Photos load when near the viewport; loading one never changes inspection content.
export default React.memo(function CloudPhoto({ photo, alt, className = '' }) {
  const target = useRef(null);
  const [source, setSource] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setSource(null); setFailed(false);
    if (photo.dataUrl || !photo.storagePath) return;
    let cancelled = false, started = false;
    const load = () => {
      if (started) return; started = true;
      downloadPhoto(photo.storagePath).then(src => { if (!cancelled) setSource({ key: `${photo.id}:${photo.storagePath}`, src }); })
        .catch(() => { if (!cancelled) setFailed(true); });
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
    }, { rootMargin: '300px' });
    if (observer && target.current) observer.observe(target.current); else load();
    return () => { cancelled = true; observer?.disconnect(); };
  }, [photo.id, photo.dataUrl, photo.storagePath, retry]);
  const src = photo.dataUrl || (source?.key === `${photo.id}:${photo.storagePath}` ? source.src : null);
  return <div ref={target} className={className}>
    {src ? <img src={src} alt={alt} loading="lazy" decoding="async" className="w-full h-full object-contain rounded-lg" />
      : <div className="h-full min-h-24 flex items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500" role="status">
        {failed ? <button type="button" className="px-3 py-2" onClick={() => setRetry(n => n + 1)}>Retry photo</button> : photo.storagePath ? 'Loading photo…' : 'Photo unavailable'}
      </div>}
  </div>;
});
