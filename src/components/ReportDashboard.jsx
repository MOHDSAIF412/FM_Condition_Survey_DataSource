import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileSpreadsheet, FileText, Loader2, CheckSquare, Square, AlertCircle, Search, X, Camera, ImageOff
} from 'lucide-react';
import { hydratePhotos, mapWithConcurrency } from '../utils/cloudSync';
import { loadSurveyForReading } from '../utils/surveyLoader';
import { confirmReportReady } from '../utils/reportCompleteness';
import NoReportAccess from './NoReportAccess';
import { generateSurveyExcel, generateSurveyPDF } from '../utils/reportExports';
import { facilityCode } from '../types/survey';
import { stageOf, STAGE_BY_KEY, STAGES } from '../utils/workflow';
import { useFormsConfig } from '../config/FormsConfigContext';
import { activeLayouts, resolveLayout } from '../config/reportLayouts';
import QhseReportDashboard from '../qhse/QhseReportDashboard';

/**
 * Pick a project, find the facilities, get one report.
 *
 * The facility list is derived from the chosen project alone, so a report can
 * only ever contain facilities belonging to it. Changing project clears the
 * selection rather than carrying ticks across to facilities the user cannot
 * see any more.
 *
 * Searching, filtering and sorting exist because a real project here holds
 * nearly ninety facilities, most of them recorded under the same name: without
 * them the only way to find one is to scroll and guess.
 */

const SORTS = {
  recent: { label: 'Most recently updated', cmp: (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) },
  number: { label: 'Facility number', cmp: (a, b) => (a.facility?.facilityNumber || 0) - (b.facility?.facilityNumber || 0) },
  snags: { label: 'Most snags', cmp: (a, b) => (b.itemCount || 0) - (a.itemCount || 0) },
  name: { label: 'Name (A–Z)', cmp: (a, b) => String(a.facilityName || '').localeCompare(String(b.facilityName || '')) }
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' }) : '');

export default function ReportDashboard({ qhseSurveys = [], initialModule = 'condition', onModuleChange, ...props }) {
  const [module, setModule] = useState(initialModule);
  useEffect(() => setModule(initialModule), [initialModule]);
  return <div className="space-y-5"><div className="sticky top-[calc(5rem+env(safe-area-inset-top))] z-20 max-w-5xl mx-auto flex flex-wrap gap-3 rounded-xl bg-[#F5F7FB] py-3" aria-label="Report module">{[['condition', 'Condition Survey reports'], ['qhse', 'QHSE Inspection reports']].map(([id,label]) => <button key={id} type="button" aria-pressed={module === id} onClick={() => { setModule(id); onModuleChange?.(id); }} className={`min-h-11 rounded-xl border px-5 py-3 text-sm font-semibold ${module === id ? 'bg-[#293771] text-white' : 'bg-white text-[#293771]'}`}>{label}</button>)}</div>{module === 'qhse' ? <QhseReportDashboard {...props} surveys={qhseSurveys} /> : <ConditionReportDashboard {...props} />}</div>;
}

function ConditionReportDashboard({ projects = [], surveys = [], initialProjectId = null, canDownloadReports = true }) {
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [failures, setFailures] = useState([]);
  const [progress, setProgress] = useState(null);   // { done, total, what }
  const cancelRef = useRef(false);

  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const [withPhotos, setWithPhotos] = useState(false);
  const [sort, setSort] = useState('recent');

  // Layouts come from the Report Builder (published, cached on this device).
  const { reports } = useFormsConfig();
  const layouts = useMemo(() => activeLayouts(reports?.config), [reports]);
  const [layoutId, setLayoutId] = useState('');
  const layout = useMemo(() => resolveLayout(layoutId || null, reports?.config), [layoutId, reports]);

  const inProject = useMemo(
    () => surveys.filter((s) => s.projectId === projectId && (!layout.approvedOnly || stageOf(s) === 'approved')),
    [surveys, projectId, layout.approvedOnly]
  );
  const hiddenByLayout = useMemo(
    () => (layout.approvedOnly ? surveys.filter((s) => s.projectId === projectId).length - inProject.length : 0),
    [surveys, projectId, inProject, layout.approvedOnly]
  );

  // What the search, filters and sort leave on screen.
  const facilities = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (s) => {
      if (!q) return true;
      const f = s.facility || {};
      return [f.facilityCode || facilityCode(f.facilityNumber), s.facilityName, f.address, f.googleLocation?.address, s.title]
        .some((v) => String(v || '').toLowerCase().includes(q));
    };
    return inProject
      .filter(match)
      .filter((s) => stage === 'all' || stageOf(s) === stage)
      .filter((s) => !withPhotos || (s.photoCount || 0) > 0)
      .sort(SORTS[sort].cmp);
  }, [inProject, query, stage, withPhotos, sort]);

  // Ticks only ever survive on facilities still listed for this project and layout.
  useEffect(() => {
    const listed = new Set(inProject.map((f) => f.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => listed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [inProject]);

  // Switching project must not leave ticks on facilities that are no longer
  // listed -- that is how a report ends up containing another project's data.
  useEffect(() => {
    setSelected(new Set());
    setMessage('');
    setFailures([]);
  }, [projectId]);

  const shownSelected = facilities.filter((f) => selected.has(f.id)).length;
  const allShownSelected = facilities.length > 0 && shownSelected === facilities.length;

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllShown = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) facilities.forEach((f) => next.delete(f.id));
      else facilities.forEach((f) => next.add(f.id));
      return next;
    });
  };

  const describe = (s) => {
    const code = s.facility?.facilityCode || facilityCode(s.facility?.facilityNumber);
    const name = s.facilityName && s.facilityName !== 'Unnamed facility' ? s.facilityName.trim() : '';
    return [code, name].filter(Boolean).join(' · ') || 'Unnamed facility';
  };

  // Everything ticked, listed or not: filters narrow the view, not the report.
  const chosen = useMemo(() => inProject.filter((f) => selected.has(f.id)), [inProject, selected]);
  const totals = useMemo(() => ({
    count: chosen.length,
    snags: chosen.reduce((n, f) => n + (f.itemCount || 0), 0),
    photos: chosen.reduce((n, f) => n + (f.photoCount || 0), 0),
    noPhotos: chosen.filter((f) => !(f.photoCount || 0)).length,
    drafts: chosen.filter((f) => stageOf(f) === 'draft').length
  }), [chosen]);

  const generate = async (kind) => {
    if (!canDownloadReports) return;
    if (!projectId) { setMessage('Please select a project first.'); return; }
    if (!chosen.length) { setMessage('Please select at least one facility.'); return; }

    // Photos are downloaded one by one before anything is drawn, so a large
    // selection is minutes of work: say so rather than appearing to hang.
    if (totals.photos > 300 && !confirm(
      `This report covers ${totals.count} facilities, ${totals.snags} snags and ${totals.photos} photos.\n\n`
      + 'Every photo is downloaded first, so it may take several minutes and produce a large file. Continue?'
    )) return;

    cancelRef.current = false;
    setBusy(kind);
    setMessage('');
    setFailures([]);
    setProgress({ done: 0, total: chosen.length, what: 'Loading facilities and photos' });
    const problems = [];
    try {
      let done = 0;
      // Several at once: one after another, a whole project took minutes.
      const results = await mapWithConcurrency(chosen, 4, async (f) => {
        if (cancelRef.current) return null;
        try {
          const full = await loadSurveyForReading(f.id);
          // Never trust the tick alone: confirm the loaded facility really does
          // belong to the chosen project before it goes into the report.
          if (!full) { problems.push(`${describe(f)}: could not be loaded`); return null; }
          if (full.projectId && full.projectId !== projectId) {
            console.warn('[report] skipped a facility that does not belong to this project:', f.id);
            problems.push(`${describe(f)}: belongs to another project`);
            return null;
          }
          // Same check for the layout: an approved-only report is re-checked
          // against the freshly loaded facility, not the list row.
          if (layout.approvedOnly && stageOf(full) !== 'approved') {
            problems.push(`${describe(f)}: not approved`);
            return null;
          }
          if (!(full.items || []).length) { problems.push(`${describe(f)}: no snags`); return null; }
          return await hydratePhotos(full);
        } catch (err) {
          // One bad facility must not lose the other thirty-nine.
          console.error('[report] facility failed:', f.id, err);
          problems.push(`${describe(f)}: ${err.message || 'could not be loaded'}`);
          return null;
        } finally {
          done += 1;
          setProgress({ done, total: chosen.length, what: 'Loading facilities and photos' });
        }
      });
      const loaded = results.filter(Boolean);

      if (cancelRef.current) { setMessage('Stopped. Nothing was downloaded.'); return; }
      if (!loaded.length) {
        setFailures(problems);
        setMessage('Nothing could be reported from the selected facilities.');
        return;
      }
      if (!confirmReportReady(loaded)) return;

      setProgress({ done: 0, total: loaded.length, what: kind === 'pdf' ? 'Building the PDF' : 'Building the workbook' });
      if (kind === 'pdf') {
        await generateSurveyPDF(loaded, 'ALL', {
          layout,
          onProgress: (d, t) => setProgress({ done: d, total: t, what: 'Building the PDF' })
        });
      } else {
        await generateSurveyExcel(loaded, 'ALL', { layout });
      }
      setFailures(problems);
      const skipped = problems.length ? `, ${problems.length} left out` : '';
      setMessage(`${kind === 'pdf' ? 'PDF' : 'Excel report'} generated for ${loaded.length} facilit${loaded.length === 1 ? 'y' : 'ies'}${skipped}.`);
    } catch (err) {
      console.error('Report failed:', err);
      setFailures(problems);
      setMessage(`Could not build the report: ${err.message || 'please try again'}.`);
    } finally {
      setBusy('');
      setProgress(null);
    }
  };

  const filtersOn = query.trim() || stage !== 'all' || withPhotos;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div className="bg-gradient-to-r from-ocs-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md">
        <h2 className="text-xl font-bold">Generate Reports</h2>
        <p className="text-sky-200/80 text-xs mt-0.5">
          Choose a project, tick the facilities to include, then generate.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="report-project" className="block text-xs font-semibold text-slate-700 mb-1">Project</label>
            <select
              id="report-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold bg-white"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectNumber} · {p.name}
                </option>
              ))}
            </select>
          </div>

          {layouts.length > 1 && (
            <div>
              <label htmlFor="report-layout" className="block text-xs font-semibold text-slate-700 mb-1">Report layout</label>
              <select
                id="report-layout"
                value={layout.id}
                onChange={(e) => setLayoutId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold bg-white"
              >
                {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {layout.description || [!layout.showCosts && 'No costs', layout.approvedOnly && 'Approved facilities only'].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}
        </div>

        {!projectId ? (
          <Note>Please select a project first.</Note>
        ) : !inProject.length ? (
          <Note>
            {hiddenByLayout
              ? `None of this project's ${hiddenByLayout} facilit${hiddenByLayout === 1 ? 'y is' : 'ies are'} approved yet, and the "${layout.name}" layout covers approved facilities only.`
              : 'This project has no facilities yet.'}
          </Note>
        ) : (
          <div>
            {/* Find */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search facilities by code, name or address"
                  placeholder="Search code, name or address…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                />
              </div>
              <select aria-label="Filter by stage" value={stage} onChange={(e) => setStage(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
                <option value="all">Any stage</option>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select aria-label="Sort facilities" value={sort} onChange={(e) => setSort(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
                {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-ocs-600" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
                With photos only
              </label>
              {filtersOn && (
                <button type="button" onClick={() => { setQuery(''); setStage('all'); setWithPhotos(false); }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-700">
                Showing {facilities.length} of {inProject.length} facilit{inProject.length === 1 ? 'y' : 'ies'}
              </span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={toggleAllShown} disabled={!facilities.length}
                  className="text-xs font-bold text-ocs-600 hover:text-ocs-700 inline-flex items-center gap-1.5 disabled:opacity-40">
                  {allShownSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  {allShownSelected ? 'Clear these' : `Select these ${facilities.length}`}
                </button>
                {selected.size > 0 && (
                  <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-bold text-slate-500 hover:text-slate-800">
                    Clear all ({selected.size})
                  </button>
                )}
              </div>
            </div>

            <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
              {!facilities.length && (
                <li className="px-4 py-6 text-center text-xs text-slate-500">No facility matches this search.</li>
              )}
              {facilities.map((f) => {
                const on = selected.has(f.id);
                const st = STAGE_BY_KEY[stageOf(f)];
                const where = f.facility?.googleLocation?.address || f.facility?.address || '';
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => toggle(f.id)}
                      aria-pressed={on}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${on ? 'bg-sky-50/60' : 'hover:bg-slate-50'}`}
                    >
                      {on
                        ? <CheckSquare className="w-4 h-4 text-ocs-600 shrink-0" />
                        : <Square className="w-4 h-4 text-slate-400 shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 truncate">
                          {describe(f)}
                        </span>
                        <span className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] text-slate-500">
                          <span>{f.itemCount || 0} snag{f.itemCount === 1 ? '' : 's'}</span>
                          <span className={`inline-flex items-center gap-1 ${f.photoCount ? '' : 'text-rose-500 font-semibold'}`}>
                            {f.photoCount ? <Camera className="w-3 h-3" /> : <ImageOff className="w-3 h-3" />}
                            {f.photoCount || 0}
                          </span>
                          {where && <span className="truncate max-w-[220px]">{where}</span>}
                          <span>{fmtDate(f.updatedAt)}</span>
                        </span>
                      </span>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${st.badge}`}>{st.short}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {hiddenByLayout > 0 && (
              <p className="text-[11px] text-slate-500 mt-2">
                {hiddenByLayout} facilit{hiddenByLayout === 1 ? 'y' : 'ies'} not approved yet {hiddenByLayout === 1 ? 'is' : 'are'} left out by this layout.
              </p>
            )}

            <p className="text-xs text-slate-600 mt-3 font-semibold">
              Selected: {totals.count} facilit{totals.count === 1 ? 'y' : 'ies'}
              {totals.snags ? ` · ${totals.snags} snag${totals.snags === 1 ? '' : 's'}` : ''}
              {totals.photos ? ` · ${totals.photos} photo${totals.photos === 1 ? '' : 's'}` : ''}
            </p>
            {(totals.noPhotos > 0 || totals.drafts > 0) && (
              <p className="text-[11px] text-amber-700 mt-1">
                {[totals.noPhotos && `${totals.noPhotos} with no photos`, totals.drafts && `${totals.drafts} still in draft`].filter(Boolean).join(' · ')}
              </p>
            )}

            {!canDownloadReports ? (
              <NoReportAccess className="mt-4" />
            ) : (
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => generate('excel')}
                  disabled={Boolean(busy) || !selected.size}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm inline-flex items-center gap-2"
                >
                  {busy === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  Generate Excel
                </button>

                <button
                  type="button"
                  onClick={() => generate('pdf')}
                  disabled={Boolean(busy) || !selected.size}
                  className="px-4 py-2.5 rounded-xl bg-ocs-600 hover:bg-ocs-500 disabled:opacity-50 text-white font-bold text-sm inline-flex items-center gap-2"
                >
                  {busy === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Generate PDF
                </button>

                {busy && (
                  <button type="button" onClick={() => { cancelRef.current = true; }}
                    className="px-3 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-bold">
                    Stop
                  </button>
                )}
                {totals.count > 1 && !busy && (
                  <span className="text-[11px] text-slate-500">One combined file for all {totals.count} facilities.</span>
                )}
              </div>
            )}
          </div>
        )}

        {progress && (
          <div role="status" className="space-y-1">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-ocs-600 transition-[width] duration-300"
                style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
            </div>
            <p className="text-[11px] text-slate-600 font-semibold">
              {progress.what}: {progress.done} of {progress.total}
              {cancelRef.current ? ' · stopping…' : ''}
            </p>
          </div>
        )}

        {message && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold">
            {message}
          </div>
        )}
        {failures.length > 0 && (
          <details className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <summary className="font-bold cursor-pointer">{failures.length} facilit{failures.length === 1 ? 'y' : 'ies'} left out of the report</summary>
            <ul className="mt-2 space-y-0.5">
              {failures.map((p, i) => <li key={i}>• {p}</li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Note({ children }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      {children}
    </div>
  );
}
