import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileText, FileSpreadsheet, FolderOpen, CheckCircle2, Loader2, Trash2, CloudOff, RefreshCw,
  ChevronDown, ClipboardList, MapPin, Camera, DollarSign, Search, Calendar, Clock,
  Building2, Factory, Trees, Wrench, Fan, Zap, Flame, Sparkles,
  Home, GraduationCap, ShoppingBag, Briefcase, Warehouse, Moon, Stethoscope, BedDouble, Trophy
} from 'lucide-react';
import { pullSurvey, hydratePhotos, mapWithConcurrency } from '../utils/cloudSync';
import { listAllSurveysOffline } from '../utils/storage';
import { sortDate } from '../utils/surveySelection';
import { generateSurveyPDF } from '../utils/pdfGenerator';
import { generateSurveyExcel } from '../utils/excelGenerator';
import { formatMoney } from '../utils/currency';
import {
  facilityCode, snagLabel, facilityTypeOf, PRIORITY_LEVELS, DEPARTMENTS
} from '../types/survey';

const TYPE_ICONS = {
  Building2, Factory, Trees, Wrench, Fan, Zap, Flame, Sparkles,
  Home, GraduationCap, ShoppingBag, Briefcase, Warehouse, Moon, Stethoscope, BedDouble, Trophy
};

// Facilities pulled at once for a combined report. Each one is itself fetching
// its photos in parallel, so this stays modest to avoid stacking the two.
const FACILITY_FETCH_CONCURRENCY = 4;


/**
 * Every facility that has been saved, expandable to its snag list, with a
 * report download per facility.
 *
 * Reports are generated from the server copy rather than whatever happens to be
 * open, so a facility submitted from the phone can be downloaded on the laptop.
 * Photo bytes are fetched first -- the generators read from dataUrl, and a
 * facility synced from another device carries only storage paths until then.
 *
 * Desktop gets a table; a phone keeps the stacked rows. The surveyor's real
 * day-to-day screen is the phone, and a 5-column table there would either
 * shrink past reading size or need sideways scrolling to reach the buttons.
 */
export default function SavedFacilities({ surveys = [], currentId, onOpen, onDelete, onRefresh, onSyncNow, onSubmit, focus, canDownloadReports = true }) {
  const [busy, setBusy] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detailsById, setDetailsById] = useState({}); // id -> { items } | { error } | 'loading'
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | submitted | draft | open
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState([]); // facility ids ticked for the combined report
  const [progress, setProgress] = useState(null); // { done, total, building } while a combined report builds
  const [viewer, setViewer] = useState(null); // { photos, index, label, location } for the full-size photo
  const panelRef = useRef(null);

  /**
   * Applies a stat tile the user tapped above: narrows or reorders this list to
   * whatever that number counted, then brings the list into view. Keyed on
   * `focus.nonce` so tapping the same tile twice still scrolls back to it.
   */
  useEffect(() => {
    if (!focus || !focus.key) return;
    if (focus.key === 'submitted') { setFilter('submitted'); setSort('newest'); }
    else if (focus.key === 'draft') { setFilter('draft'); setSort('newest'); }
    else if (focus.key === 'snags') { setFilter('all'); setSort('snags'); }
    else if (focus.key === 'photos') { setFilter('all'); setSort('photos'); }
    else { setFilter('all'); setSort('newest'); }
    setQuery('');
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus?.nonce, focus?.key]);

  const waiting = surveys.filter((s) => s.pendingSync).length;

  /**
   * Every facility carries a reference (FAC-001) from the moment it is created,
   * so one with no name typed yet is still identifiable -- and two of them are
   * still tellable apart, which "Unnamed facility" never managed.
   */
  const describe = (s) => {
    const code = s.facility?.facilityCode || facilityCode(s.facility?.facilityNumber);
    const name = s.facilityName && s.facilityName !== 'Unnamed facility' ? s.facilityName : '';
    if (code && name) return `${code} · ${name}`;
    if (code) return code;
    if (name) return name;
    const n = s.itemCount || 0;
    return `Unnamed facility (${n} snag${n === 1 ? '' : 's'})`;
  };

  const counts = {
    all: surveys.length,
    submitted: surveys.filter((s) => s.status === 'submitted').length,
    draft: surveys.filter((s) => s.status !== 'submitted').length,
    open: surveys.filter((s) => s.id === currentId).length
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = surveys.filter((s) => {
      if (filter === 'submitted' && s.status !== 'submitted') return false;
      if (filter === 'draft' && s.status === 'submitted') return false;
      if (filter === 'open' && s.id !== currentId) return false;
      if (!q) return true;
      const type = facilityTypeOf(s.facility);
      const haystack = [
        describe(s),
        s.status === 'submitted' ? 'submitted' : 'draft',
        type?.name || '',
        s.id === currentId ? 'open now' : ''
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });

    rows = [...rows].sort((a, b) => {
      if (sort === 'oldest') return sortDate(a) - sortDate(b);
      if (sort === 'name') return describe(a).localeCompare(describe(b));
      if (sort === 'snags') return (b.itemCount || 0) - (a.itemCount || 0);
      if (sort === 'photos') return (b.photoCount || 0) - (a.photoCount || 0);
      return sortDate(b) - sortDate(a); // newest first
    });
    return rows;
  }, [surveys, query, filter, sort, currentId]);

  const visibleIds = visible.map((s) => s.id);
  const selectedVisible = selected.filter((id) => visibleIds.includes(id));
  const allTicked = visible.length > 0 && selectedVisible.length === visible.length;

  const toggleOne = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAll = () =>
    setSelected(allTicked ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])]);

  const syncNow = async () => {
    if (!onSyncNow) return;
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await onSyncNow();
      setSyncResult(res?.message || 'Done.');
    } catch (err) {
      setSyncResult('Could not sync: ' + (err.message || err));
    } finally {
      setSyncing(false);
    }
  };

  /**
   * The server copy where there is one, otherwise this device's.
   *
   * A facility submitted with no signal is not on the server yet, but the
   * device holds it in full -- photo bytes included -- so its report can still
   * be produced rather than refused.
   */
  const loadSurvey = async (surveyId) => {
    try {
      const remote = await pullSurvey(surveyId, {});
      if (remote) return remote;
    } catch (err) {
      console.info('Server copy unavailable, using the one on this device:', err?.message);
    }
    return (await listAllSurveysOffline()).find((s) => s && s.id === surveyId) || null;
  };

  /**
   * Toggles a row open and lazily fetches its snags the first time.
   *
   * The snag list is shown as soon as it arrives and the photos are fetched
   * afterwards, filling the thumbnails in behind it. Waiting for the photos
   * first meant a facility carrying forty of them sat blank for seconds on a
   * phone before anything appeared -- the list is what the surveyor opened the
   * row to read, so it must not queue behind the evidence.
   */
  const toggleExpand = async (s) => {
    const opening = expandedId !== s.id;
    setExpandedId(opening ? s.id : null);
    if (!opening || detailsById[s.id]) return;

    setDetailsById((prev) => ({ ...prev, [s.id]: 'loading' }));
    let full;
    try {
      full = await loadSurvey(s.id);
      setDetailsById((prev) => ({ ...prev, [s.id]: { items: full?.items || [], photosLoading: true } }));
    } catch (err) {
      setDetailsById((prev) => ({ ...prev, [s.id]: { error: err.message || 'Could not load snags.' } }));
      return;
    }

    if (!full) {
      setDetailsById((prev) => ({ ...prev, [s.id]: { items: [] } }));
      return;
    }

    try {
      const ready = await hydratePhotos(full);
      setDetailsById((prev) => ({ ...prev, [s.id]: { items: ready?.items || [] } }));
    } catch (err) {
      // The snags are already on screen; losing the pictures must not blank them.
      console.warn('Photos could not be loaded for this facility:', err?.message);
      setDetailsById((prev) => ({ ...prev, [s.id]: { items: full.items || [] } }));
    }
  };

  /**
   * One workbook containing the ticked facilities, or all of them when none are.
   *
   * Facilities are fetched several at a time. Doing them strictly one after
   * another meant a 67-facility report spent minutes waiting on round trips
   * that had no reason to be sequential.
   */
  const downloadAll = async () => {
    const wanted = selectedVisible.length
      ? surveys.filter((s) => selectedVisible.includes(s.id))
      : surveys;
    setBusy('all:excel');
    setSyncResult('');
    setProgress({ done: 0, total: wanted.length });
    try {
      let done = 0;
      const pulled = await mapWithConcurrency(wanted, FACILITY_FETCH_CONCURRENCY, async (s) => {
        try {
          const full = await loadSurvey(s.id);
          if (!full || !(full.items || []).length) return null;
          return await hydratePhotos(full);
        } catch (err) {
          console.warn('Skipped a facility in the combined report:', s.id, err?.message);
          return null;
        } finally {
          done++;
          setProgress({ done, total: wanted.length });
        }
      });

      const loaded = pulled.filter(Boolean);
      if (!loaded.length) {
        alert('None of the chosen facilities have snags to report yet.');
        return;
      }
      setProgress({ done: wanted.length, total: wanted.length, building: true });
      await generateSurveyExcel(loaded, 'ALL');
      setSyncResult(`Combined Excel created for ${loaded.length} facilities.`);
    } catch (err) {
      console.error('Combined report failed:', err);
      alert('Could not build the combined report: ' + (err.message || err));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const download = async (surveyId, kind) => {
    setBusy(`${surveyId}:${kind}`);
    try {
      const survey = await loadSurvey(surveyId);
      if (!survey) {
        alert('That facility could not be loaded. Check your connection and try again.');
        return;
      }
      const ready = await hydratePhotos(survey);
      if (kind === 'pdf') await generateSurveyPDF(ready, 'ALL');
      else await generateSurveyExcel(ready, 'ALL');
    } catch (err) {
      console.error('Report failed:', err);
      alert('Could not build the report: ' + (err.message || err));
    } finally {
      setBusy(null);
    }
  };

  const submit = async (s) => {
    if (!onSubmit) return;
    setBusy(`${s.id}:submit`);
    try {
      await onSubmit(s.id);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (s) => {
    if (!onDelete) return;
    setBusy(`${s.id}:delete`);
    try {
      await onDelete(s.id, describe(s));
    } finally {
      setBusy(null);
    }
  };

  if (!surveys.length) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
        <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="font-bold text-slate-700 text-base">No saved facilities yet</h3>
        <p className="text-sm text-slate-500 mt-1">
          Finish a facility and press Submit. It will be listed here with its reports.
        </p>
      </div>
    );
  }

  const TypeBadge = ({ facility }) => {
    const type = facilityTypeOf(facility);
    if (!type) return <span className="text-xs text-slate-400">Not set</span>;
    const Icon = TYPE_ICONS[type.icon] || Building2;
    return (
      <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 ${type.badge}`}>
        <Icon className="w-3.5 h-3.5" /> {type.name}
      </span>
    );
  };

  /**
   * A draft is also the place to finish it: leaving the list, opening the
   * facility and submitting from inside was the only route before, so drafts
   * with completed work sat unsubmitted.
   */
  const StatusBadge = ({ s }) => {
    if (s.status === 'submitted') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Draft
        </span>
        {onSubmit && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={(e) => { e.stopPropagation(); submit(s); }}
            title="Mark this facility submitted"
            className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white inline-flex items-center gap-1.5"
          >
            {busy === `${s.id}:submit`
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <CheckCircle2 className="w-3.5 h-3.5" />}
            Submit
          </button>
        )}
      </span>
    );
  };

  const RowActions = ({ s, compact }) => (
    <div className={`flex items-center gap-2 ${compact ? 'flex-wrap' : 'justify-end'}`} onClick={(e) => e.stopPropagation()}>
      {s.id !== currentId && (
        <button
          type="button"
          onClick={() => onOpen(s.id)}
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5"
        >
          <FolderOpen className="w-3.5 h-3.5" /> Open
        </button>
      )}
      {canDownloadReports && (
      <>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => download(s.id, 'pdf')}
        className="px-3 py-2 rounded-xl bg-ocs-600 hover:bg-ocs-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5"
      >
        {busy === `${s.id}:pdf` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
        PDF
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => download(s.id, 'excel')}
        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5"
      >
        {busy === `${s.id}:excel` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
        Excel
      </button>
      </>
      )}
      {onDelete && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => remove(s)}
          title="Permanently delete this facility"
          className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 text-xs font-bold inline-flex items-center gap-1 border border-red-200"
        >
          {busy === `${s.id}:delete` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );

  /**
   * Full-size photo, with arrows when the snag carries more than one.
   *
   * Built as a function returning JSX rather than a nested component: a
   * component declared inside the render is a new type on every keystroke of
   * state, so React would tear down and rebuild the <img> each time the
   * surveyor pressed Next and the picture would blink.
   */
  const renderPhotoViewer = () => {
    if (!viewer) return null;
    const { photos, index, label, location } = viewer;
    const photo = photos[index];
    if (!photo) return null;
    const step = (by) => setViewer({ ...viewer, index: (index + by + photos.length) % photos.length });

    return (
      <div
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        onClick={() => setViewer(null)}
        role="dialog"
        aria-modal="true"
      >
        <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">{label}</p>
              {location && <p className="text-white/60 text-xs truncate">{location}</p>}
            </div>
            <button
              type="button"
              onClick={() => setViewer(null)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold shrink-0"
            >
              Close
            </button>
          </div>

          <img
            src={photo.dataUrl}
            alt={label}
            className="w-full max-h-[70vh] object-contain rounded-xl bg-black"
          />

          <div className="flex items-center justify-between gap-3 mt-3">
            <button
              type="button"
              disabled={photos.length < 2}
              onClick={() => step(-1)}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-xs font-bold"
            >
              ‹ Previous
            </button>
            <span className="text-white/70 text-xs font-semibold">
              Photo {index + 1} of {photos.length}
            </span>
            <button
              type="button"
              disabled={photos.length < 2}
              onClick={() => step(1)}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-xs font-bold"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>
    );
  };

  const SnagDetail = ({ detail }) => {
    const photosLoading = !!(detail && detail.photosLoading);
    return (
    <>
      {detail === 'loading' && (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading snags…
        </div>
      )}
      {detail && detail.error && <div className="text-rose-600 text-sm py-3">{detail.error}</div>}
      {detail && detail.items && (
        detail.items.length === 0 ? (
          <p className="text-sm text-slate-400 py-3">No snags recorded yet.</p>
        ) : (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-slate-50/50">
            {detail.items.map((item, idx) => {
              const priority = PRIORITY_LEVELS[item.priority] || PRIORITY_LEVELS[2];
              const dept = DEPARTMENTS[item.department] || DEPARTMENTS.GENERAL;
              return (
                <div key={item.id || idx} className="px-4 py-3 flex items-start gap-3 bg-white">
                  <span className="w-6 h-6 rounded-lg bg-slate-800 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm">{snagLabel(item, idx)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${priority?.badge || 'bg-slate-200 text-slate-700'}`}>
                        P{item.priority}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${dept?.badge || 'border-slate-200 text-slate-600'}`}>
                        {(dept?.name || 'General').split('&')[0]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 flex-wrap">
                      {item.location && (
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.location}</span>
                      )}
                      {!!(item.photos || []).length && (
                        <span className="inline-flex items-center gap-1">
                          <Camera className="w-3 h-3" />
                          {item.photos.length} photo{item.photos.length === 1 ? '' : 's'}
                          {photosLoading && !item.photos.some((p) => p.dataUrl) && (
                            <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                          )}
                        </span>
                      )}
                      {!!item.estimatedCost && (
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <DollarSign className="w-3 h-3" /> {formatMoney(item.estimatedCost)}
                        </span>
                      )}
                    </div>

                    {!!(item.photos || []).filter((p) => p.dataUrl).length && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {item.photos.filter((p) => p.dataUrl).map((p, pi) => (
                          <button
                            key={p.id || pi}
                            type="button"
                            onClick={() => setViewer({
                              photos: item.photos.filter((x) => x.dataUrl),
                              index: pi,
                              label: snagLabel(item, idx),
                              location: item.location
                            })}
                            title={`View photo ${pi + 1}`}
                            className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-ocs-500 hover:ring-2 hover:ring-sky-200 transition-all shrink-0"
                          >
                            <img src={p.dataUrl} alt={`Snag photo ${pi + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </>
    );
  };

  const pills = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'submitted', label: 'Submitted', n: counts.submitted },
    { key: 'draft', label: 'Draft', n: counts.draft },
    { key: 'open', label: 'Open now', n: counts.open }
  ];

  const excelLabel = selectedVisible.length
    ? `Selected in one Excel (${selectedVisible.length})`
    : `All in one Excel (${surveys.length})`;

  // A 67-facility report takes a while whatever happens, so say where it is up
  // to rather than showing an unchanging "Building…".
  const buildingLabel = !progress
    ? 'Building…'
    : progress.building
      ? 'Writing workbook…'
      : `Loading ${progress.done} of ${progress.total}…`;

  return (
    <div ref={panelRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4">
      {renderPhotoViewer()}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <h3 className="text-base font-bold text-slate-800 whitespace-nowrap inline-flex items-center gap-2">
          <Building2 className="w-4 h-4 text-ocs-600" />
          Saved Facilities <span className="text-slate-400 font-semibold">({surveys.length})</span>
        </h3>

        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <div className="relative flex-1 min-w-[190px] lg:flex-none lg:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search facility, ID or status…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs font-semibold text-ocs-600 hover:text-ocs-700 px-2"
          >
            Refresh
          </button>
          {surveys.length > 1 && canDownloadReports && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={downloadAll}
              title="One Excel workbook containing the chosen facilities"
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              {busy === 'all:excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              {busy === 'all:excel' ? buildingLabel : excelLabel}
            </button>
          )}
          {onSyncNow && (
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              title="Upload anything saved on this device that has not reached the server yet"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                waiting > 0 ? 'bg-flame-500 hover:bg-flame-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {syncing ? 'Syncing…' : waiting > 0 ? `Sync now (${waiting})` : 'Sync now'}
            </button>
          )}
        </div>
      </div>

      {/* Filter pills + sort */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {pills.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setFilter(p.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                filter === p.key
                  ? 'bg-ocs-600 text-white border-ocs-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p.label} <span className={filter === p.key ? 'text-sky-200' : 'text-slate-400'}>({p.n})</span>
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-500 font-semibold">
          Sort by:
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name / ID</option>
            <option value="snags">Most snags</option>
            <option value="photos">Most photos</option>
          </select>
        </label>
      </div>

      {syncResult && (
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 text-[13px] text-slate-700">
          {syncResult}
        </div>
      )}

      {!visible.length && (
        <div className="px-6 py-10 text-center">
          <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600">Nothing matches that</p>
          <p className="text-xs text-slate-400 mt-1">Try a different search or filter.</p>
        </div>
      )}

      {/* Desktop table */}
      {!!visible.length && (
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="w-10 pl-6 py-3">
                  <input
                    type="checkbox"
                    checked={allTicked}
                    onChange={toggleAll}
                    title="Tick every facility shown"
                    className="w-4 h-4 rounded border-slate-300 accent-ocs-600"
                  />
                </th>
                <th className="py-3 font-bold">Facility / ID</th>
                <th className="py-3 font-bold">Type</th>
                <th className="py-3 font-bold">Status</th>
                <th className="py-3 font-bold">Last Updated</th>
                <th className="py-3 pr-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((s) => {
                const isOpen = expandedId === s.id;
                const detail = detailsById[s.id];
                const snagCount = detail && detail.items ? detail.items.length : s.itemCount;
                const when = s.submittedAt || s.updatedAt;
                return (
                  <React.Fragment key={s.id}>
                    <tr
                      onClick={() => toggleExpand(s)}
                      className="hover:bg-slate-50/80 cursor-pointer align-middle"
                    >
                      <td className="pl-6 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(s.id)}
                          onChange={() => toggleOne(s.id)}
                          className="w-4 h-4 rounded border-slate-300 accent-ocs-600"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                          />
                          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                            <Building2 className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm truncate">{describe(s)}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1 shrink-0">
                                <ClipboardList className="w-3 h-3" />
                                {snagCount ?? 0} snag{snagCount === 1 ? '' : 's'}
                              </span>
                              {!!s.photoCount && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 inline-flex items-center gap-1 shrink-0">
                                  <Camera className="w-3 h-3" />
                                  {s.photoCount}
                                </span>
                              )}
                              {s.id === currentId && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-ocs-50 text-ocs-700 border border-ocs-200 shrink-0">
                                  Open now
                                </span>
                              )}
                              {s.pendingSync && (
                                <span
                                  title="Saved on this device. It uploads automatically when there is a connection."
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1 shrink-0"
                                >
                                  <CloudOff className="w-3 h-3" /> Waiting
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {s.submittedAt ? 'Submitted ' : 'Updated '}
                              {new Date(when).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4"><TypeBadge facility={s.facility} /></td>
                      <td className="py-3 pr-4"><StatusBadge s={s} /></td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-start gap-1.5 text-xs text-slate-600">
                          <Calendar className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                          <span>
                            {new Date(when).toLocaleDateString()}
                            <br />
                            <span className="text-slate-400">{new Date(when).toLocaleTimeString()}</span>
                          </span>
                        </span>
                      </td>
                      <td className="py-3 pr-6"><RowActions s={s} /></td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} className="px-6 pb-5 pt-0 bg-slate-50/40">
                          <div className="pl-10"><SnagDetail detail={detail} /></div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Phone / tablet: stacked rows */}
      <ul className="lg:hidden divide-y divide-slate-100">
        {visible.map((s) => {
          const isOpen = expandedId === s.id;
          const detail = detailsById[s.id];
          const snagCount = detail && detail.items ? detail.items.length : s.itemCount;
          return (
            <li key={s.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpand(s)}
                onKeyDown={(e) => { if (e.key === 'Enter') toggleExpand(s); }}
                className="w-full text-left px-4 sm:px-6 py-4 flex flex-col gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 shrink-0 mt-0.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-base">{describe(s)}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1 shrink-0">
                        <ClipboardList className="w-3 h-3" />
                        {snagCount ?? 0} snag{snagCount === 1 ? '' : 's'}
                      </span>
                      <StatusBadge s={s} />
                      {s.id === currentId && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ocs-50 text-ocs-700 border border-ocs-200 shrink-0">
                          Open now
                        </span>
                      )}
                      {s.pendingSync && (
                        <span
                          title="Saved on this device. It uploads automatically when there is a connection."
                          className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1 shrink-0"
                        >
                          <CloudOff className="w-3 h-3" /> Waiting to upload
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <TypeBadge facility={s.facility} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                      {s.submittedAt
                        ? `Submitted ${new Date(s.submittedAt).toLocaleString()}`
                        : `Updated ${new Date(s.updatedAt).toLocaleString()}`}
                    </p>
                  </div>
                </div>
                <div className="pl-8"><RowActions s={s} compact /></div>
              </div>

              {isOpen && (
                <div className="px-4 sm:px-6 pb-5 pl-12 -mt-1">
                  <SnagDetail detail={detail} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
