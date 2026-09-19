import React, { useState } from 'react';
import { Check, AlertCircle, Loader2, Upload, X, RotateCcw, History, Save, Trash2 } from 'lucide-react';
import { useEscapeKey } from '../utils/useEscapeKey';

/** Shared pieces for admin pages built on useConfigDraft. */

const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white';
const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function Banner({ kind, children }) {
  const cls = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-rose-50 border-rose-200 text-rose-700',
    warn: 'bg-amber-50 border-amber-200 text-amber-800'
  }[kind];
  const Icon = kind === 'ok' ? Check : AlertCircle;
  return (
    <div role={kind === 'ok' ? 'status' : 'alert'} className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${cls}`}>
      <Icon className="w-4 h-4 shrink-0" /><span>{children}</span>
    </div>
  );
}

/** Title, live / draft status and the History / Discard / Save / Publish buttons. */
export function DraftHeader({ title, liveLabel, d, problems = [], onHistory, onPublishClick }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
            Live: {d.published ? `version ${d.published.version}` : liveLabel}
          </span>
          {d.draft && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">
              Draft v{d.draft.version}
            </span>
          )}
          {d.dirty && <span className="font-semibold text-amber-600">Unsaved changes</span>}
          {!d.dirty && !d.draft && <span>Make a change to start a draft.</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={onHistory}
          className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5">
          <History className="w-4 h-4" /> History
        </button>
        {(d.dirty || d.draft) && (
          <button type="button" onClick={d.discard} disabled={!!d.busy}
            className="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
            <Trash2 className="w-4 h-4" /> Discard draft
          </button>
        )}
        <button type="button" onClick={d.save} disabled={!d.dirty || !!d.busy || problems.length > 0}
          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
          {d.busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save draft
        </button>
        <button type="button" onClick={onPublishClick}
          disabled={!!d.busy || problems.length > 0 || (!d.dirty && !d.draft)}
          className="px-4 py-2 rounded-lg bg-flame-500 hover:bg-flame-600 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
          <Upload className="w-4 h-4" /> Review &amp; publish
        </button>
      </div>
    </div>
  );
}

export function PublishDialog({ title, subtitle, changes, problems = [], busy, onCancel, onPublish }) {
  const [notes, setNotes] = useState('');
  useEscapeKey(onCancel, !busy);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="cfg-publish-title" className="w-full max-w-xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 id="cfg-publish-title" className="font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          {problems.length > 0 && <Banner kind="error">{problems.join(' ')}</Banner>}
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Changes compared with the live version ({changes.length})</p>
          {changes.length ? (
            <ul className="space-y-1">
              {changes.map((c, i) => (
                <li key={i} className="text-sm text-slate-700 flex gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> {c}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No differences from the live version.</p>}
          <div>
            <label htmlFor="cfg-publish-notes" className="block text-xs font-semibold text-slate-700 mb-1">Note for the change history (optional)</label>
            <input id="cfg-publish-notes" className={input} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-semibold">Cancel</button>
          <button type="button" onClick={() => onPublish(notes)} disabled={busy || problems.length > 0 || !changes.length}
            className="px-4 py-2 rounded-lg bg-flame-500 hover:bg-flame-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Approve &amp; publish
          </button>
        </div>
      </div>
    </div>
  );
}

export function HistoryDialog({ title, versions, describe, defaults, emptyText, busy, onRollback, onClose }) {
  const [openId, setOpenId] = useState(null);
  useEscapeKey(onClose, !busy);
  const ordered = [...versions].sort((a, b) => b.version - a.version);
  const previousPublished = (v) => ordered
    .filter((x) => x.version < v.version && (x.status === 'published' || x.status === 'superseded'))[0];
  const statusCls = {
    published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    superseded: 'bg-slate-50 text-slate-600 border-slate-200',
    discarded: 'bg-slate-50 text-slate-400 border-slate-200'
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="cfg-history-title" className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <h3 id="cfg-history-title" className="font-bold text-slate-900 flex-1">{title}</h3>
          <button type="button" aria-label="Close history" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-slate-100">
          {!ordered.length && <p className="p-5 text-sm text-slate-500">{emptyText}</p>}
          {ordered.map((v) => {
            const lines = describe(previousPublished(v)?.config || defaults(), v.config);
            const open = openId === v.id;
            return (
              <div key={v.id} className="px-5 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 text-sm">Version {v.version}</span>
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${statusCls[v.status]}`}>{v.status}</span>
                  <span className="text-[11px] text-slate-500">{v.publishedAt ? `published ${fmtDate(v.publishedAt)}` : `created ${fmtDate(v.createdAt)}`}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={() => setOpenId(open ? null : v.id)} aria-expanded={open}
                      className="text-xs font-semibold text-sky-700">{open ? 'Hide' : 'Show'} changes ({lines.length})</button>
                    {v.status === 'superseded' && (
                      <button type="button" onClick={() => onRollback(v)} disabled={busy}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Roll back to this
                      </button>
                    )}
                  </div>
                </div>
                {v.notes && <p className="text-xs text-slate-600 mt-1">{v.notes}</p>}
                {open && (
                  <ul className="mt-2 space-y-0.5">
                    {lines.length ? lines.map((l, i) => <li key={i} className="text-xs text-slate-700">• {l}</li>)
                      : <li className="text-xs text-slate-400">No differences from the version before it.</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
