import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { listAuditLog } from '../config/configStore';
import { describeChanges } from '../config/formConfig';

const TABLES = {
  '': 'Everything',
  app_config_versions: 'Configuration',
  fm_survey_users: 'Users & access',
  inspection_templates: 'Inspection templates',
  fm_roles: 'Roles & permissions',
  fm_project_members: 'Project teams'
};

const fmt = (d) => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
const IGNORED = new Set(['updated_at', 'created_at']);

const show = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** Field-by-field old -> new values, with configuration shown as plain-English changes. */
function Details({ entry }) {
  const oldD = entry.old_data || {};
  const newD = entry.new_data || {};

  if (entry.table_name === 'app_config_versions' && oldD.config && newD.config
      && JSON.stringify(oldD.config) !== JSON.stringify(newD.config) && newD.kind === 'forms') {
    const lines = describeChanges(oldD.config, newD.config);
    return (
      <ul className="space-y-0.5">
        {lines.map((l, i) => <li key={i} className="text-xs text-slate-700">• {l}</li>)}
        {!lines.length && <li className="text-xs text-slate-400">Formatting only.</li>}
      </ul>
    );
  }

  const keys = [...new Set([...Object.keys(oldD), ...Object.keys(newD)])]
    .filter((k) => !IGNORED.has(k) && JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]));
  if (!keys.length) return <p className="text-xs text-slate-400">No field values changed.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-3 font-semibold">Field</th>
            <th className="py-1 pr-3 font-semibold">Old value</th>
            <th className="py-1 font-semibold">New value</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="align-top border-t border-slate-100">
              <td className="py-1 pr-3 font-mono text-slate-600">{k}</td>
              <td className="py-1 pr-3 text-rose-700 break-all max-w-xs">
                {k === 'config' ? '(configuration)' : show(oldD[k])}
              </td>
              <td className="py-1 text-emerald-700 break-all max-w-xs">
                {k === 'config' ? '(configuration)' : show(newD[k])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Who changed what, and when. Written by database triggers, so it records a
 * change however it was made -- this screen, another admin, or a direct edit.
 */
export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [table, setTable] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [more, setMore] = useState(true);

  const load = async (append = false) => {
    setLoading(true);
    setError('');
    try {
      const before = append && entries.length ? entries[entries.length - 1].id : null;
      const rows = await listAuditLog({ limit: 50, before, table: table || null });
      setEntries((prev) => (append ? [...prev, ...rows] : rows));
      setMore(rows.length === 50);
    } catch (err) {
      setError(err.message || 'Could not load the change history.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [table]);

  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Audit Log</h2>
          <p className="text-xs text-slate-500">Every change to configuration, users and templates, with the old and new values. Entries cannot be edited or removed.</p>
        </div>
        <label htmlFor="audit-filter" className="sr-only">Show changes to</label>
        <select id="audit-filter" value={table} onChange={(e) => setTable(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
          {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" onClick={() => load(false)} className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {!entries.length && !loading && <p className="p-6 text-sm text-slate-500 text-center">No changes recorded yet.</p>}
        {entries.map((e) => {
          const isOpen = open.has(e.id);
          return (
            <div key={e.id} className="px-4 py-3">
              <button type="button" onClick={() => toggle(e.id)} aria-expanded={isOpen} className="w-full text-left flex items-start gap-2">
                {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5 text-slate-400" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{e.summary || `${e.table_name} ${e.action}`}</span>
                  <span className="block text-[11px] text-slate-500">
                    {fmt(e.changed_at)} · {e.changed_by_email || (e.changed_by ? e.changed_by : 'System / server function')} · {TABLES[e.table_name] || e.table_name}
                  </span>
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{e.action}</span>
              </button>
              {isOpen && <div className="mt-2 ml-6"><Details entry={e} /></div>}
            </div>
          );
        })}
        {loading && <p className="p-4 text-center text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading…</p>}
      </div>
      {more && entries.length > 0 && !loading && (
        <button type="button" onClick={() => load(true)} className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Load older changes
        </button>
      )}
    </div>
  );
}
