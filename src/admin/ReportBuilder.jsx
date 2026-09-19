import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Loader2, AlertCircle, Check, ChevronUp, ChevronDown, Archive, ArchiveRestore, Copy,
  Lock, History, Upload, X, Save, Trash2, RotateCcw, Star, FileText
} from 'lucide-react';
import {
  SECTIONS, PHOTO_LIMITS, DEFAULT_TITLE, defaultReportsConfig, normaliseReportsConfig,
  validateReportsConfig, describeReportChanges, clientLayout, editableColumns, columnInfo
} from '../config/reportLayouts';
import { listVersions, saveDraft, discardDraft, publishDraft, rollbackTo } from '../config/configStore';
import { useEscapeKey } from '../utils/useEscapeKey';
import { defaultReportFooter } from '../config/appSettings';

const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white';
const newId = () => `layout_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

/**
 * Report Builder: the layouts people pick from when they generate a PDF or
 * Excel report. Same draft / publish / history / rollback as the Survey
 * Builder -- nothing changes for anyone until a version is published.
 *
 * The built-in Standard layout is today's report and cannot be edited, only
 * copied, so there is always one layout that is exactly what reports were
 * before layouts existed. Layouts are archived, never deleted.
 */
export default function ReportBuilder({ onPublished }) {
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState([]);
  const [working, setWorking] = useState(null);
  const [savedJson, setSavedJson] = useState('');
  const [selectedId, setSelectedId] = useState('standard');
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const published = versions.find((v) => v.status === 'published') || null;
  const draft = versions.find((v) => v.status === 'draft') || null;
  const dirty = working && JSON.stringify(working) !== savedJson;
  const baseline = published?.config || defaultReportsConfig();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listVersions('reports');
      setVersions(list);
      const d = list.find((v) => v.status === 'draft');
      const p = list.find((v) => v.status === 'published');
      const start = normaliseReportsConfig(clone((d || p)?.config || defaultReportsConfig()));
      setWorking(start);
      setSavedJson(d ? JSON.stringify(start) : JSON.stringify(normaliseReportsConfig(clone(p?.config || defaultReportsConfig()))));
    } catch (err) {
      setError(err.message || 'Could not load the report layouts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const problems = useMemo(() => (working ? validateReportsConfig(working) : []), [working]);
  const pendingChanges = useMemo(() => (working ? describeReportChanges(baseline, working) : []), [baseline, working]);

  const update = (fn) => setWorking((prev) => {
    const next = clone(prev);
    fn(next);
    return next;
  });
  const updateLayout = (id, fn) => update((c) => { const l = c.layouts.find((x) => x.id === id); if (l) fn(l, c); });

  const handleSave = async () => {
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const saved = await saveDraft('reports', working, {
        draftId: draft?.id,
        basedOn: published?.id || null,
        expectedUpdatedAt: draft?.updatedAt || null
      });
      setVersions((prev) => [saved, ...prev.filter((v) => v.id !== saved.id)]);
      setWorking(saved.config);
      setSavedJson(JSON.stringify(saved.config));
      setNotice(`Draft v${saved.version} saved. Reports do not change until you publish.`);
      return saved;
    } catch (err) {
      setError(err.message || 'Could not save the draft.');
      return null;
    } finally {
      setBusy('');
    }
  };

  const handlePublish = async (notes) => {
    setBusy('publish');
    setError('');
    try {
      let d = draft;
      if (dirty || !d) d = await handleSave();
      if (!d) return;
      const live = await publishDraft(d, notes);
      setShowPublish(false);
      await load();
      setNotice(`Version ${live.version} is live. Generate Reports offers these layouts now.`);
      onPublished?.();
    } catch (err) {
      setError(err.message || 'Could not publish.');
    } finally {
      setBusy('');
    }
  };

  const handleDiscard = async () => {
    if (!confirm(draft
      ? `Discard draft v${draft.version}? Every unpublished change is thrown away. The live layouts are not affected.`
      : 'Throw away your unsaved changes?')) return;
    setBusy('discard');
    setError('');
    try {
      if (draft) await discardDraft(draft.id);
      await load();
      setSelectedId('standard');
      setNotice('Draft discarded. You are looking at the live layouts again.');
    } catch (err) {
      setError(err.message || 'Could not discard the draft.');
    } finally {
      setBusy('');
    }
  };

  const handleRollback = async (version) => {
    if (dirty || draft) {
      alert('Save and publish, or discard, the current draft before rolling back.');
      return;
    }
    const lines = describeReportChanges(baseline, version.config);
    if (!confirm(`Roll back to version ${version.version}?\n\nThis publishes a new version with those layouts:\n\n${lines.map((l) => `• ${l}`).join('\n') || '• No differences from the live version'}\n\nSurvey data is not changed.`)) return;
    setBusy('rollback');
    setError('');
    try {
      const live = await rollbackTo(version);
      await load();
      setShowHistory(false);
      setNotice(`Rolled back: version ${live.version} (a copy of version ${version.version}) is live.`);
      onPublished?.();
    } catch (err) {
      setError(err.message || 'Could not roll back.');
    } finally {
      setBusy('');
    }
  };

  const uniqueName = (base) => {
    const names = new Set(working.layouts.filter((l) => !l.archived).map((l) => l.name.toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) if (!names.has(`${base} (${n})`.toLowerCase())) return `${base} (${n})`;
  };

  const addLayout = (from) => {
    const id = newId();
    const layout = from
      ? { ...clone(from), id, builtIn: false, archived: false, name: uniqueName(`Copy of ${from.name}`) }
      : { ...clientLayout(id), name: uniqueName('Client report (no costs)') };
    update((c) => { c.layouts.push(layout); });
    setSelectedId(id);
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin inline" /> Loading report layouts…</div>;
  }
  if (!working) {
    return <Banner kind="error">{error || 'Could not load the report layouts.'}</Banner>;
  }

  const visibleLayouts = working.layouts.filter((l) => showArchived || !l.archived);
  const archivedCount = working.layouts.filter((l) => l.archived).length;
  const selected = working.layouts.find((l) => l.id === selectedId) || working.layouts[0];

  return (
    <div className="space-y-4 pb-24">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Report Builder</h2>
          <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
              Live: {published ? `version ${published.version}` : 'Standard report only'}
            </span>
            {draft && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                Draft v{draft.version}
              </span>
            )}
            {dirty && <span className="font-semibold text-amber-600">Unsaved changes</span>}
            {!dirty && !draft && <span>Make a change to start a draft.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setShowHistory(true)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5">
            <History className="w-4 h-4" /> History
          </button>
          {(dirty || draft) && (
            <button type="button" onClick={handleDiscard} disabled={!!busy}
              className="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> Discard draft
            </button>
          )}
          <button type="button" onClick={handleSave} disabled={!dirty || !!busy || problems.length > 0}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save draft
          </button>
          <button type="button" onClick={() => setShowPublish(true)}
            disabled={!!busy || problems.length > 0 || (!dirty && !draft)}
            className="px-4 py-2 rounded-lg bg-flame-500 hover:bg-flame-600 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
            <Upload className="w-4 h-4" /> Review &amp; publish
          </button>
        </div>
      </div>

      {notice && <Banner kind="ok">{notice}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      {problems.length > 0 && <Banner kind="warn">Fix before saving: {problems.join(' ')}</Banner>}

      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        {/* Layout list */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 self-start space-y-2 min-w-0">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Layouts</p>
          <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
            {visibleLayouts.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => setSelectedId(l.id)} aria-current={l.id === selected.id ? 'true' : undefined}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-start gap-2 ${l.id === selected.id ? 'bg-ocs-600 text-white' : 'hover:bg-slate-50 text-slate-700'} ${l.archived ? 'opacity-60' : ''}`}>
                  <FileText className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{l.name}</span>
                    <span className={`block text-[11px] ${l.id === selected.id ? 'text-sky-100' : 'text-slate-400'}`}>
                      {[l.builtIn && 'Built-in', l.id === working.defaultLayoutId && 'Default', l.archived && 'Archived',
                        !l.showCosts && 'No costs', l.approvedOnly && 'Approved only'].filter(Boolean).join(' • ') || 'Custom'}
                    </span>
                  </span>
                  {l.id === working.defaultLayoutId && <Star className="w-4 h-4 shrink-0 fill-current" aria-label="Default layout" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <button type="button" onClick={() => addLayout(null)}
              className="w-full px-3 py-2 rounded-lg bg-ocs-50 text-ocs-700 hover:bg-ocs-100 text-xs font-bold inline-flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> New client report (no costs)
            </button>
            {archivedCount > 0 && (
              <button type="button" onClick={() => setShowArchived((v) => !v)} className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700">
                {showArchived ? 'Hide' : 'Show'} archived ({archivedCount})
              </button>
            )}
          </div>
        </div>

        <LayoutEditor
          key={selected.id}
          layout={selected}
          isDefault={selected.id === working.defaultLayoutId}
          onChange={(fn) => updateLayout(selected.id, fn)}
          onMakeDefault={() => update((c) => { c.defaultLayoutId = selected.id; })}
          onCopy={() => addLayout(selected)}
          onArchive={(archived) => updateLayout(selected.id, (l, c) => {
            l.archived = archived;
            if (archived && c.defaultLayoutId === l.id) c.defaultLayoutId = 'standard';
          })}
        />
      </div>

      {showPublish && (
        <PublishDialog
          changes={pendingChanges}
          problems={problems}
          busy={busy === 'publish'}
          nextVersion={(Math.max(0, ...versions.map((v) => v.version)) + (draft ? 0 : 1)) || 1}
          onCancel={() => setShowPublish(false)}
          onPublish={handlePublish}
        />
      )}
      {showHistory && (
        <HistoryDialog versions={versions} busy={busy === 'rollback'} onRollback={handleRollback} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

function LayoutEditor({ layout, isDefault, onChange, onMakeDefault, onCopy, onArchive }) {
  const locked = layout.builtIn;
  const columns = editableColumns(layout);
  const setColumns = (fn) => onChange((l) => { const cols = clone(editableColumns(l)); fn(cols); l.columns = cols; });
  const move = (i, d) => setColumns((cols) => {
    const j = i + d;
    if (j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j], cols[i]];
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-5 min-w-0">
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 truncate">{layout.name}</h3>
          <p className="text-xs text-slate-500">{layout.description || 'No description.'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isDefault && !layout.archived && (
            <button type="button" onClick={onMakeDefault}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" /> Make default
            </button>
          )}
          <button type="button" onClick={onCopy}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          {!locked && (
            <button type="button" onClick={() => onArchive(!layout.archived)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5">
              {layout.archived ? <><ArchiveRestore className="w-3.5 h-3.5" /> Restore</> : <><Archive className="w-3.5 h-3.5" /> Archive</>}
            </button>
          )}
        </div>
      </div>

      {locked && (
        <Banner kind="warn">
          <span className="inline-flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> The Standard report is today&apos;s report and cannot be changed.</span>{' '}
          Use Copy to make your own version of it.
        </Banner>
      )}

      <fieldset disabled={locked || layout.archived} className="space-y-5 min-w-0 disabled:opacity-70">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Layout name" id="rl-name">
            <input id="rl-name" className={input} value={layout.name} maxLength={80} onChange={(e) => onChange((l) => { l.name = e.target.value; })} />
          </Field>
          <Field label="Description (shown when choosing)" id="rl-desc">
            <input id="rl-desc" className={input} value={layout.description} maxLength={240} onChange={(e) => onChange((l) => { l.description = e.target.value; })} />
          </Field>
          <Field label="Report title" id="rl-title" hint={`Blank uses "${DEFAULT_TITLE.pdf}"`}>
            <input id="rl-title" className={input} value={layout.title} maxLength={80} onChange={(e) => onChange((l) => { l.title = e.target.value; })} />
          </Field>
          <Field label="Footer text" id="rl-footer" hint={`Blank uses "${defaultReportFooter()}"`}>
            <input id="rl-footer" className={input} value={layout.footerText} maxLength={120} onChange={(e) => onChange((l) => { l.footerText = e.target.value; })} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          <Toggle label="Show costs" help="Off removes every AED figure: columns, totals and the CapEx summary."
            checked={layout.showCosts} onChange={(v) => onChange((l) => { l.showCosts = v; })} />
          <Toggle label="Approved facilities only" help="Reports with this layout leave out anything not yet approved."
            checked={layout.approvedOnly} onChange={(v) => onChange((l) => { l.approvedOnly = v; })} />
          <Field label="Photos per snag" id="rl-photos">
            <select id="rl-photos" className={input} value={layout.photosPerSnag}
              onChange={(e) => onChange((l) => { l.photosPerSnag = Number(e.target.value); })}>
              {PHOTO_LIMITS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Sections</p>
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {SECTIONS.map((s) => (
              <Toggle key={s.key} label={s.label} help={s.help} checked={layout.sections[s.key]}
                onChange={(v) => onChange((l) => { l.sections[s.key] = v; })} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Snag register columns</p>
          <p className="text-xs text-slate-500 mb-2">
            Tick to show, rename if you like, and use the arrows to change the order.
            {layout.columns ? '' : ' This layout still uses each format\'s standard columns; any change here switches it to this list.'}
          </p>
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {columns.map((c, i) => {
              const info = columnInfo(c.key);
              const off = (info.cost && !layout.showCosts) || (c.key === 'photo' && !layout.sections.photos);
              return (
                <li key={c.key} className="px-3 py-2 flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <input type="checkbox" aria-label={`Show ${info.label}`} checked={c.visible}
                    onChange={(e) => setColumns((cols) => { cols[i].visible = e.target.checked; })} className="w-4 h-4 accent-ocs-600" />
                  <span className="text-sm font-semibold text-slate-700 w-40 shrink-0 truncate">{info.label}</span>
                  <input className={`${input} py-1.5 min-w-0 flex-1`} aria-label={`Heading for ${info.label}`} value={c.label}
                    placeholder={info.pdf || info.excel} maxLength={60}
                    onChange={(e) => setColumns((cols) => { cols[i].label = e.target.value; })} />
                  {(info.help || off) && (
                    <span className="text-[11px] text-slate-400 w-full sm:w-auto sm:max-w-[160px]">
                      {off ? (info.cost ? 'Hidden: costs are off' : 'Hidden: photos are off') : info.help}
                    </span>
                  )}
                  <span className="flex items-center shrink-0">
                    <button type="button" aria-label={`Move ${info.label} up`} disabled={i === 0} onClick={() => move(i, -1)}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                    <button type="button" aria-label={`Move ${info.label} down`} disabled={i === columns.length - 1} onClick={() => move(i, 1)}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </fieldset>
    </div>
  );
}

function Field({ label, id, hint, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1 truncate">{hint}</p>}
    </div>
  );
}

function Toggle({ label, help, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" className="w-4 h-4 mt-0.5 accent-ocs-600" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {help && <span className="block text-[11px] text-slate-500">{help}</span>}
      </span>
    </label>
  );
}

function Banner({ kind, children }) {
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

function PublishDialog({ changes, problems, busy, nextVersion, onCancel, onPublish }) {
  const [notes, setNotes] = useState('');
  useEscapeKey(onCancel, !busy);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="rl-publish-title" className="w-full max-w-xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 id="rl-publish-title" className="font-bold text-slate-900">Publish report layouts, version {nextVersion}</h3>
          <p className="text-xs text-slate-500 mt-0.5">Generate Reports offers these layouts straight away. Survey data is not changed.</p>
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
          ) : (
            <p className="text-sm text-slate-500">No differences from the live version.</p>
          )}
          <div>
            <label htmlFor="rl-publish-notes" className="block text-xs font-semibold text-slate-700 mb-1">Note for the change history (optional)</label>
            <input id="rl-publish-notes" className={input} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
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

function HistoryDialog({ versions, busy, onRollback, onClose }) {
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
      <div role="dialog" aria-modal="true" aria-labelledby="rl-history-title" className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <h3 id="rl-history-title" className="font-bold text-slate-900 flex-1">Report layout history</h3>
          <button type="button" aria-label="Close history" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-slate-100">
          {!ordered.length && <p className="p-5 text-sm text-slate-500">Nothing published yet. Reports use the Standard layout.</p>}
          {ordered.map((v) => {
            const prev = previousPublished(v);
            const lines = describeReportChanges(prev?.config || defaultReportsConfig(), v.config);
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
