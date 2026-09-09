import React, { useState } from 'react';
import {
  FileText, FileSpreadsheet, FolderOpen, CheckCircle2, Loader2, Trash2, CloudOff, RefreshCw,
  ChevronDown, ClipboardList, MapPin, Camera, DollarSign
} from 'lucide-react';
import { pullSurvey, hydratePhotos } from '../utils/cloudSync';
import { listAllSurveysOffline } from '../utils/storage';
import { generateSurveyPDF } from '../utils/pdfGenerator';
import { generateSurveyExcel } from '../utils/excelGenerator';
import { formatMoney } from '../utils/currency';
import { facilityCode, snagLabel, PRIORITY_LEVELS, DEPARTMENTS } from '../types/survey';

/**
 * Every facility that has been saved, expandable to its snag list, with a
 * report download per facility.
 *
 * Reports are generated from the server copy rather than whatever happens to be
 * open, so a facility submitted from the phone can be downloaded on the laptop.
 * Photo bytes are fetched first -- the generators read from dataUrl, and a
 * facility synced from another device carries only storage paths until then.
 */
export default function SavedFacilities({ surveys = [], currentId, onOpen, onDelete, onRefresh, onSyncNow }) {
  const [busy, setBusy] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detailsById, setDetailsById] = useState({}); // id -> { items } | { error } | 'loading'

  const waiting = surveys.filter((s) => s.pendingSync).length;

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

  /** Toggles a row open and lazily fetches its snags the first time. */
  const toggleExpand = async (s) => {
    const opening = expandedId !== s.id;
    setExpandedId(opening ? s.id : null);
    if (!opening || detailsById[s.id]) return;

    setDetailsById((prev) => ({ ...prev, [s.id]: 'loading' }));
    try {
      const full = await loadSurvey(s.id);
      setDetailsById((prev) => ({ ...prev, [s.id]: { items: full?.items || [] } }));
    } catch (err) {
      setDetailsById((prev) => ({ ...prev, [s.id]: { error: err.message || 'Could not load snags.' } }));
    }
  };

  /** One workbook containing every saved facility. */
  const downloadAll = async () => {
    setBusy('all:excel');
    setSyncResult('');
    try {
      const loaded = [];
      for (const s of surveys) {
        const full = await loadSurvey(s.id);
        if (full && (full.items || []).length) loaded.push(await hydratePhotos(full));
      }
      if (!loaded.length) {
        alert('None of the saved facilities have snags to report yet.');
        return;
      }
      await generateSurveyExcel(loaded, 'ALL');
      setSyncResult(`Combined Excel created for ${loaded.length} facilities.`);
    } catch (err) {
      console.error('Combined report failed:', err);
      alert('Could not build the combined report: ' + (err.message || err));
    } finally {
      setBusy(null);
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Stacked on a phone: three action buttons beside the heading squeezed
          the title onto two lines and pushed the last one off the edge. */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-base font-bold text-slate-800 whitespace-nowrap">
          Saved Facilities <span className="text-slate-400 font-semibold">({surveys.length})</span>
        </h3>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs font-semibold text-ocs-600 hover:text-ocs-700 px-2"
          >
            Refresh
          </button>
          {surveys.length > 1 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={downloadAll}
              title="One Excel workbook containing every saved facility"
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              {busy === 'all:excel'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileSpreadsheet className="w-3.5 h-3.5" />}
              {busy === 'all:excel' ? 'Building…' : `All in one Excel (${surveys.length})`}
            </button>
          )}
          {onSyncNow && (
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              title="Upload anything saved on this device that has not reached the server yet"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                waiting > 0
                  ? 'bg-flame-500 hover:bg-flame-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {syncing
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              {syncing ? 'Syncing…' : waiting > 0 ? `Sync now (${waiting})` : 'Sync now'}
            </button>
          )}
        </div>
      </div>

      {syncResult && (
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 text-[13px] text-slate-700">
          {syncResult}
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {surveys.map((s) => {
          const isCurrent = s.id === currentId;
          const isOpen = expandedId === s.id;
          const detail = detailsById[s.id];
          const snagCount = detail && detail.items ? detail.items.length : s.itemCount;

          return (
            <li key={s.id}>
              {/* The row itself toggles the snag list; the action buttons sit in
                  their own click zone so pressing PDF/Excel/Delete never also
                  opens or closes the row underneath them. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpand(s)}
                onKeyDown={(e) => { if (e.key === 'Enter') toggleExpand(s); }}
                className="w-full text-left px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 cursor-pointer hover:bg-slate-50/80 transition-colors"
              >
                {/* Name + badges: always its own full-width block first, so a
                    long facility name never gets squeezed down to a couple of
                    letters by the action buttons competing for the same row. */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 shrink-0 mt-0.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-base">
                        {describe(s)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1 shrink-0">
                        <ClipboardList className="w-3 h-3" />
                        {snagCount ?? 0} snag{snagCount === 1 ? '' : 's'}
                      </span>
                      {s.status === 'submitted' ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3" /> Submitted
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                          Draft
                        </span>
                      )}
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ocs-100 text-ocs-700 border border-ocs-200 shrink-0">
                          Open now
                        </span>
                      )}
                      {s.pendingSync && (
                        <span
                          title="Saved on this device. It uploads automatically when there is a connection."
                          className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1 shrink-0"
                        >
                          <CloudOff className="w-3 h-3" /> Waiting to upload
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {s.submittedAt
                        ? `Submitted ${new Date(s.submittedAt).toLocaleString()}`
                        : `Updated ${new Date(s.updatedAt).toLocaleString()}`}
                    </p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-2 shrink-0 flex-wrap pl-8 sm:pl-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => onOpen(s.id)}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                    >
                      Open
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => download(s.id, 'pdf')}
                    className="px-3 py-2 rounded-xl bg-ocs-600 hover:bg-ocs-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    {busy === `${s.id}:pdf`
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FileText className="w-3.5 h-3.5" />}
                    PDF
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => download(s.id, 'excel')}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    {busy === `${s.id}:excel`
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FileSpreadsheet className="w-3.5 h-3.5" />}
                    Excel
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => remove(s)}
                      title="Permanently delete this facility"
                      className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 text-xs font-bold inline-flex items-center gap-1 border border-red-200"
                    >
                      {busy === `${s.id}:delete`
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded snag list */}
              {isOpen && (
                <div className="px-6 pb-5 pl-14 -mt-1">
                  {detail === 'loading' && (
                    <div className="flex items-center gap-2 text-slate-500 text-sm py-3">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading snags…
                    </div>
                  )}

                  {detail && detail.error && (
                    <div className="text-rose-600 text-sm py-3">{detail.error}</div>
                  )}

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
                                  <span className="font-semibold text-slate-900 text-sm">
                                    {snagLabel(item, idx)}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${priority?.badge || 'bg-slate-200 text-slate-700'}`}>
                                    P{item.priority}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${dept?.badge || 'border-slate-200 text-slate-600'}`}>
                                    {(dept?.name || 'General').split('&')[0]}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 flex-wrap">
                                  {item.location && (
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="w-3 h-3" /> {item.location}
                                    </span>
                                  )}
                                  {!!(item.photos || []).length && (
                                    <span className="inline-flex items-center gap-1">
                                      <Camera className="w-3 h-3" /> {item.photos.length}
                                    </span>
                                  )}
                                  {!!item.estimatedCost && (
                                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                                      <DollarSign className="w-3 h-3" /> {formatMoney(item.estimatedCost)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
