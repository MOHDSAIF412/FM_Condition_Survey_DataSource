import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Camera, Loader2, AlertTriangle, MapPin, ImageOff, X, ChevronLeft, ChevronRight, Search
} from 'lucide-react';
import { listProjectEvidence, downloadPhoto } from '../utils/cloudSync';
import { PRIORITY_LEVELS, DEPARTMENTS } from '../types/survey';

/**
 * Every photo in a project, and -- more usefully -- every snag that has none.
 *
 * Image bytes are fetched per tile as it scrolls into view. Loading all of them
 * up front is ~94MB for a project this size, which is exactly the sort of thing
 * that makes a phone on site unusable.
 */
export default function PhotoGallery({ project, facilities = [], onOpenFacility }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [missing, setMissing] = useState([]);
  const [tab, setTab] = useState('photos');       // photos | missing
  const [facilityId, setFacilityId] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [query, setQuery] = useState('');
  const [viewerIndex, setViewerIndex] = useState(null);

  const nameById = useMemo(() => {
    const m = new Map();
    for (const f of facilities) {
      const code = f.facility?.facilityCode || '';
      m.set(f.id, [code, f.facilityName].filter(Boolean).join(' · ') || 'Unnamed facility');
    }
    return m;
  }, [facilities]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const ids = facilities.map((f) => f.id);
        const res = await listProjectEvidence(ids);
        if (cancelled) return;
        setPhotos(res.photos);
        setMissing(res.snagsWithoutPhotos);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load the photos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [facilities]);

  const matches = (row) => {
    if (facilityId !== 'ALL' && row.surveyId !== facilityId) return false;
    if (priority !== 'ALL' && String(row.priority) !== priority) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.location, row.description, nameById.get(row.surveyId) || '']
      .join(' ').toLowerCase().includes(q);
  };

  const visiblePhotos = useMemo(() => photos.filter(matches), [photos, facilityId, priority, query]);
  const visibleMissing = useMemo(() => missing.filter(matches), [missing, facilityId, priority, query]);

  // Worst first: an urgent defect with no photograph is the one that matters.
  const missingSorted = useMemo(
    () => [...visibleMissing].sort((a, b) => (a.priority || 9) - (b.priority || 9)),
    [visibleMissing]
  );
  const urgentMissing = missing.filter((m) => m.priority === 1).length;

  const close = () => setViewerIndex(null);
  const step = (by) => setViewerIndex((i) => {
    if (i === null) return null;
    return (i + by + visiblePhotos.length) % visiblePhotos.length;
  });

  useEffect(() => {
    if (viewerIndex === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerIndex, visiblePhotos.length]);

  const SnagMeta = ({ row }) => {
    const dept = DEPARTMENTS[row.department] || DEPARTMENTS.GENERAL;
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {row.priority && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORITY_LEVELS[row.priority]?.badge || ''}`}>
            P{row.priority}
          </span>
        )}
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${dept.badge}`}>
          {dept.name.split('&')[0].trim()}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-bold text-slate-800 inline-flex items-center gap-2">
            <Camera className="w-4 h-4 text-violet-600" />
            Photo Evidence
            <span className="text-slate-400 font-semibold">
              {project?.projectNumber ? `· ${project.projectNumber}` : ''}
            </span>
          </h2>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setTab('photos')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                tab === 'photos' ? 'bg-ocs-600 text-white border-ocs-600' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              All photos <span className={tab === 'photos' ? 'text-sky-200' : 'text-slate-400'}>({photos.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('missing')}
              title="Snags carrying no photograph at all"
              className={`px-3 py-1.5 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 ${
                tab === 'missing'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : missing.length
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {!!missing.length && <AlertTriangle className="w-3.5 h-3.5" />}
              No photo <span className={tab === 'missing' ? 'text-rose-200' : 'text-slate-400'}>({missing.length})</span>
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search location or defect…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <select
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className="px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white max-w-[200px]"
          >
            <option value="ALL">All facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>{nameById.get(f.id)}</option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
          >
            <option value="ALL">All priorities</option>
            {[1, 2, 3, 4].map((p) => <option key={p} value={String(p)}>P{p} only</option>)}
          </select>
        </div>

        {/* The line that makes this screen worth opening before a report goes out. */}
        {!loading && !!urgentMissing && tab === 'photos' && (
          <button
            type="button"
            onClick={() => { setTab('missing'); setPriority('1'); }}
            className="w-full text-left px-4 sm:px-6 py-3 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs font-bold inline-flex items-center gap-2 hover:bg-rose-100"
          >
            <AlertTriangle className="w-4 h-4" />
            {urgentMissing} urgent {urgentMissing === 1 ? 'snag has' : 'snags have'} no photo evidence — review before issuing
          </button>
        )}

        {loading && (
          <div className="p-10 text-center text-slate-500 text-sm inline-flex items-center gap-2 w-full justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading evidence…
          </div>
        )}

        {error && <div className="p-6 text-rose-600 text-sm">{error}</div>}

        {!loading && !error && tab === 'photos' && (
          visiblePhotos.length ? (
            <div className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {visiblePhotos.map((p, i) => (
                <GalleryTile
                  key={p.id}
                  photo={p}
                  facilityName={nameById.get(p.surveyId)}
                  onOpen={() => setViewerIndex(i)}
                />
              ))}
            </div>
          ) : (
            <div className="p-10 text-center">
              <ImageOff className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">No photos match that</p>
            </div>
          )
        )}

        {!loading && !error && tab === 'missing' && (
          missingSorted.length ? (
            <ul className="divide-y divide-slate-100">
              {missingSorted.map((m) => (
                <li key={m.id} className="px-4 sm:px-6 py-3 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {m.description || m.location || 'Snag with no description'}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <SnagMeta row={m} />
                      <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {nameById.get(m.surveyId) || 'Unknown facility'}
                        {m.location ? ` · ${m.location}` : ''}
                      </span>
                    </div>
                  </div>
                  {onOpenFacility && (
                    <button
                      type="button"
                      onClick={() => onOpenFacility(m.surveyId)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold shrink-0"
                    >
                      Open facility
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-10 text-center">
              <Camera className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-emerald-700">Every snag has a photo</p>
              <p className="text-xs text-slate-500 mt-1">Nothing is missing evidence in this selection.</p>
            </div>
          )
        )}
      </div>

      {viewerIndex !== null && visiblePhotos[viewerIndex] && (
        <FullPhoto
          photo={visiblePhotos[viewerIndex]}
          facilityName={nameById.get(visiblePhotos[viewerIndex].surveyId)}
          index={viewerIndex}
          total={visiblePhotos.length}
          onClose={close}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      )}
    </div>
  );
}

/**
 * One thumbnail. The bytes are fetched the first time the tile comes near the
 * viewport and cached on the element, so scrolling back up costs nothing.
 */
function GalleryTile({ photo, facilityName, onOpen }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || src) return;
    const io = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      try {
        setSrc(await downloadPhoto(photo.storagePath));
      } catch {
        setFailed(true);
      }
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [photo.storagePath, src]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => src && onOpen()}
      title={`${facilityName || ''}${photo.location ? ' · ' + photo.location : ''}`}
      className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group hover:border-ocs-500 hover:ring-2 hover:ring-sky-200 transition-all"
    >
      {src ? (
        <img src={src} alt={photo.description || 'Snag photo'} className="w-full h-full object-cover" />
      ) : failed ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-1">
          <ImageOff className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Unavailable</span>
        </span>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin" />
        </span>
      )}

      {photo.priority && (
        <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORITY_LEVELS[photo.priority]?.badge || ''}`}>
          P{photo.priority}
        </span>
      )}
      {src && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] font-semibold px-2 py-1.5 text-left opacity-0 group-hover:opacity-100 transition-opacity truncate">
          {photo.location || facilityName || 'Snag photo'}
        </span>
      )}
    </button>
  );
}

/** Full-size photo with the snag it belongs to written beside it. */
function FullPhoto({ photo, facilityName, index, total, onClose, onPrev, onNext }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    downloadPhoto(photo.storagePath)
      .then((d) => { if (!cancelled) setSrc(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [photo.storagePath]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate">
              {photo.description || 'Snag photo'}
            </p>
            <p className="text-white/60 text-xs truncate">
              {facilityName}{photo.location ? ` · ${photo.location}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          {src ? (
            <img src={src} alt={photo.description || 'Snag photo'} className="w-full max-h-[70vh] object-contain rounded-xl bg-black" />
          ) : (
            <div className="w-full h-[50vh] flex items-center justify-center text-white/60 rounded-xl bg-black/40">
              {failed ? 'This photo could not be loaded.' : <Loader2 className="w-6 h-6 animate-spin" />}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-3">
          <button type="button" onClick={onPrev} disabled={total < 2}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-xs font-bold inline-flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-white/70 text-xs font-semibold">Photo {index + 1} of {total}</span>
          <button type="button" onClick={onNext} disabled={total < 2}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-xs font-bold inline-flex items-center gap-1">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
