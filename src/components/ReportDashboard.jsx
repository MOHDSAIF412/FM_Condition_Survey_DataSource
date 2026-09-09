import React, { useState, useEffect, useMemo } from 'react';
import { FileSpreadsheet, FileText, Loader2, CheckSquare, Square, AlertCircle } from 'lucide-react';
import { pullSurvey, hydratePhotos } from '../utils/cloudSync';
import { listAllSurveysOffline } from '../utils/storage';
import { generateSurveyExcel } from '../utils/excelGenerator';
import { generateSurveyPDF } from '../utils/pdfGenerator';
import { facilityCode, calculateSurveyStats } from '../types/survey';
import { formatMoney } from '../utils/currency';

/**
 * Pick a project, tick the facilities, get one report.
 *
 * The facility list is derived from the chosen project alone, so a report can
 * only ever contain facilities belonging to it. Changing project clears the
 * selection rather than carrying ticks across to facilities the user cannot
 * see any more.
 */
export default function ReportDashboard({ projects = [], surveys = [], initialProjectId = null }) {
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const facilities = useMemo(
    () => surveys.filter((s) => s.projectId === projectId),
    [surveys, projectId]
  );

  // Switching project must not leave ticks on facilities that are no longer
  // listed -- that is how a report ends up containing another project's data.
  useEffect(() => {
    setSelected(new Set());
    setMessage('');
  }, [projectId]);

  const allSelected = facilities.length > 0 && selected.size === facilities.length;

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(facilities.map((f) => f.id)));
  };

  const describe = (s) => {
    const code = s.facility?.facilityCode || facilityCode(s.facility?.facilityNumber);
    const name = s.facilityName && s.facilityName !== 'Unnamed facility' ? s.facilityName : '';
    return [code, name].filter(Boolean).join(' · ') || 'Unnamed facility';
  };

  /** Server copy when there is one, otherwise this device's. */
  const loadFull = async (id) => {
    try {
      const remote = await pullSurvey(id, {});
      if (remote) return remote;
    } catch { /* offline: fall through to the local copy */ }
    return (await listAllSurveysOffline()).find((s) => s && s.id === id) || null;
  };

  const generate = async (kind) => {
    if (!projectId) { setMessage('Please select a project first.'); return; }
    if (!selected.size) { setMessage('Please select at least one facility.'); return; }

    setBusy(kind);
    setMessage('');
    try {
      const chosen = facilities.filter((f) => selected.has(f.id));
      const loaded = [];
      for (const f of chosen) {
        const full = await loadFull(f.id);
        // Never trust the tick alone: confirm the loaded facility really does
        // belong to the chosen project before it goes into the report.
        if (!full) continue;
        if (full.projectId && full.projectId !== projectId) {
          console.warn('[report] skipped a facility that does not belong to this project:', f.id);
          continue;
        }
        if ((full.items || []).length) loaded.push(await hydratePhotos(full));
      }

      if (!loaded.length) {
        setMessage('The selected facilities have no snags to report yet.');
        return;
      }

      if (kind === 'pdf') {
        // The PDF generator covers one facility at a time, so a multi-facility
        // request produces one file each rather than silently dropping the rest.
        for (const s of loaded) await generateSurveyPDF(s, 'ALL');
        setMessage(`${loaded.length} PDF${loaded.length === 1 ? '' : 's'} generated.`);
      } else {
        await generateSurveyExcel(loaded, 'ALL');
        setMessage(`Excel report generated for ${loaded.length} facilit${loaded.length === 1 ? 'y' : 'ies'}.`);
      }
    } catch (err) {
      console.error('Report failed:', err);
      setMessage('Could not build the report. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const preview = useMemo(() => {
    const chosen = facilities.filter((f) => selected.has(f.id));
    const snags = chosen.reduce((n, f) => n + (f.itemCount || 0), 0);
    return { count: chosen.length, snags };
  }, [facilities, selected]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <div className="bg-gradient-to-r from-ocs-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md">
        <h2 className="text-xl font-bold">Report Dashboard</h2>
        <p className="text-sky-200/80 text-xs mt-0.5">
          Choose a project, tick the facilities to include, then generate.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Project</label>
          <select
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

        {!projectId ? (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            Please select a project first.
          </div>
        ) : !facilities.length ? (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            This project has no facilities yet.
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700">
                Facilities ({facilities.length})
              </label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-bold text-ocs-600 hover:text-ocs-700 inline-flex items-center gap-1.5"
              >
                {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                Select All
              </button>
            </div>

            <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {facilities.map((f) => {
                const on = selected.has(f.id);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => toggle(f.id)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3"
                    >
                      {on
                        ? <CheckSquare className="w-4 h-4 text-ocs-600 shrink-0" />
                        : <Square className="w-4 h-4 text-slate-400 shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 truncate">
                          {describe(f)}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {f.itemCount || 0} snag{f.itemCount === 1 ? '' : 's'}
                          {f.status === 'submitted' ? ' · Submitted' : ' · Draft'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="text-xs text-slate-600 mt-3 font-semibold">
              Selected: {preview.count} facilit{preview.count === 1 ? 'y' : 'ies'}
              {preview.snags ? ` · ${preview.snags} snags` : ''}
            </p>

            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button
                type="button"
                onClick={() => generate('excel')}
                disabled={Boolean(busy) || !selected.size}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm inline-flex items-center gap-2"
              >
                {busy === 'excel'
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <FileSpreadsheet className="w-4 h-4" />}
                Generate Excel
              </button>

              <button
                type="button"
                onClick={() => generate('pdf')}
                disabled={Boolean(busy) || !selected.size}
                className="px-4 py-2.5 rounded-xl bg-ocs-600 hover:bg-ocs-500 disabled:opacity-50 text-white font-bold text-sm inline-flex items-center gap-2"
              >
                {busy === 'pdf'
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <FileText className="w-4 h-4" />}
                Generate PDF
              </button>
            </div>
          </div>
        )}

        {message && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
