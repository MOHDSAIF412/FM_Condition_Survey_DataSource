import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Loader2, AlertCircle, Check, ChevronUp, ChevronDown, Archive, ArchiveRestore, Pencil,
  Lock, Eye, EyeOff, Monitor, Smartphone, FileText, FileSpreadsheet, History, Upload, X, Save,
  Trash2, LayoutList, RotateCcw
} from 'lucide-react';
import { FIELD_TYPES, canChangeType } from '../config/fieldTypes';
import {
  SCOPES, defaultFormsConfig, normaliseFormsConfig, validateFormsConfig, describeChanges,
  sectionsForScope, fieldsForSection, makeFieldKey, activeOptions
} from '../config/formConfig';
import {
  listVersions, saveDraft, discardDraft, publishDraft, rollbackTo
} from '../config/configStore';
import { FormsConfigPreview } from '../config/FormsConfigContext';
import { CustomFieldList } from '../components/CustomFields';
import { useEscapeKey } from '../utils/useEscapeKey';
import RulesEditor from './RulesEditor';

const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white';
const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

/**
 * Forms & Fields: sections, fields and dropdown options for the facility and
 * snag forms.
 *
 * Every change is made to a DRAFT. Nothing reaches surveyors until Publish,
 * which shows the full list of changes first. Published versions are kept and
 * any of them can be rolled back to. Fields and options are archived, never
 * deleted, so recorded answers always keep their meaning.
 */
export default function FormBuilder({ onPublished, openHistory = false, mode = 'fields' }) {
  // 'rules' shows the Conditional Rules editor on the same draft as the fields.
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState([]);
  const [working, setWorking] = useState(null);
  const [savedJson, setSavedJson] = useState('');
  const [scope, setScope] = useState('snag');
  const [showArchived, setShowArchived] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const [showHistory, setShowHistory] = useState(openHistory);
  const [preview, setPreview] = useState(null); // 'web' | 'mobile' | null

  const published = versions.find((v) => v.status === 'published') || null;
  const draft = versions.find((v) => v.status === 'draft') || null;
  const dirty = working && JSON.stringify(working) !== savedJson;
  const baseline = published?.config || defaultFormsConfig();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listVersions('forms');
      setVersions(list);
      const d = list.find((v) => v.status === 'draft');
      const p = list.find((v) => v.status === 'published');
      const start = normaliseFormsConfig(clone((d || p)?.config || defaultFormsConfig()));
      setWorking(start);
      setSavedJson(d ? JSON.stringify(start) : JSON.stringify(normaliseFormsConfig(clone(p?.config || defaultFormsConfig()))));
    } catch (err) {
      setError(err.message || 'Could not load the form configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const problems = useMemo(() => (working ? validateFormsConfig(working) : []), [working]);
  const pendingChanges = useMemo(() => (working ? describeChanges(baseline, working) : []), [baseline, working]);

  const update = (fn) => setWorking((prev) => {
    const next = clone(prev);
    fn(next);
    return next;
  });

  const handleSave = async () => {
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const saved = await saveDraft('forms', working, {
        draftId: draft?.id,
        basedOn: published?.id || null,
        expectedUpdatedAt: draft?.updatedAt || null
      });
      setVersions((prev) => [saved, ...prev.filter((v) => v.id !== saved.id)]);
      setWorking(saved.config);
      setSavedJson(JSON.stringify(saved.config));
      setNotice(`Draft v${saved.version} saved. Surveyors will not see it until you publish.`);
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
      setNotice(`Version ${live.version} is live. The web portal uses it now; phones pick it up the next time they are online.`);
      onPublished?.();
    } catch (err) {
      setError(err.message || 'Could not publish.');
    } finally {
      setBusy('');
    }
  };

  const handleDiscard = async () => {
    if (!confirm(draft
      ? `Discard draft v${draft.version}? Every unpublished change is thrown away. The live version is not affected.`
      : 'Throw away your unsaved changes?')) return;
    setBusy('discard');
    setError('');
    try {
      if (draft) await discardDraft(draft.id);
      await load();
      setNotice('Draft discarded. You are looking at the live version again.');
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
    const lines = describeChanges(baseline, version.config);
    if (!confirm(`Roll back to version ${version.version}?\n\nThis publishes a new version with that configuration:\n\n${lines.slice(0, 12).map((l) => `• ${l}`).join('\n') || '• No differences from the live version'}${lines.length > 12 ? `\n…and ${lines.length - 12} more` : ''}\n\nRecorded survey data is not changed.`)) return;
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

  // ---------------------------------------------------------------- editing
  const addSection = () => {
    const label = prompt(`Name of the new ${SCOPES[scope].label.toLowerCase()} section:`);
    if (!label || !label.trim()) return;
    update((c) => {
      const custom = c.sections.filter((s) => s.scope === scope && !s.system);
      const order = Math.min(899, Math.max(100, ...custom.map((s) => s.order + 1), 100));
      c.sections.push({ id: newId('sec'), scope, label: label.trim(), archived: false, system: false, order });
    });
  };

  const renameSection = (section) => {
    const label = prompt('Section name:', section.label);
    if (!label || !label.trim()) return;
    update((c) => { c.sections.find((s) => s.id === section.id).label = label.trim(); });
  };

  const moveSection = (section, dir) => update((c) => {
    const list = c.sections.filter((s) => s.scope === scope && !s.system && !s.archived).sort((a, b) => a.order - b.order);
    const i = list.findIndex((s) => s.id === section.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((s, idx) => { c.sections.find((x) => x.id === s.id).order = 100 + idx; });
  });

  const toggleSectionArchived = (section) => {
    if (!section.archived && !confirm(`Archive the section "${section.label}"?\n\nIts fields stop appearing for new work. Answers already recorded are kept and still appear in reports.`)) return;
    update((c) => { const s = c.sections.find((x) => x.id === section.id); s.archived = !s.archived; });
  };

  const addField = (sectionId) => {
    // Made here, not inside the updater: React runs updaters later, so an id
    // assigned there is not known yet when the editor is opened below.
    const createdId = newId('fld');
    update((c) => {
      const keys = c.fields.filter((f) => f.scope === scope).map((f) => f.key);
      const inSection = c.fields.filter((f) => f.sectionId === sectionId && !f.system);
      c.fields.push({
        id: createdId, key: makeFieldKey('New field', keys), scope, sectionId, label: 'New field', type: 'text',
        helpText: '', placeholder: '', required: false, hidden: false, archived: false, system: false,
        web: true, mobile: true, pdf: true, excel: true,
        order: Math.max(100, ...inSection.map((f) => f.order + 1), 100), options: [], publishedOnce: false
      });
    });
    setEditingFieldId(createdId);
  };

  const moveField = (field, dir) => update((c) => {
    const list = c.fields.filter((f) => f.sectionId === field.sectionId && !f.system && !f.archived).sort((a, b) => a.order - b.order);
    const i = list.findIndex((f) => f.id === field.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((f, idx) => { c.fields.find((x) => x.id === f.id).order = 100 + idx; });
  });

  if (loading && !working) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading the form configuration…
      </div>
    );
  }
  if (!working) {
    return <Banner kind="error">{error || 'The form configuration is not available.'}</Banner>;
  }

  const sections = sectionsForScope(working, scope, { includeArchived: showArchived });
  const editingField = working.fields.find((f) => f.id === editingFieldId) || null;
  const publishedField = editingField && baseline.fields.find((f) => f.id === editingField.id);

  return (
    <div className="space-y-4 pb-24">
      {/* Status and actions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{mode === 'rules' ? 'Conditional Rules' : <>Forms &amp; Fields</>}</h2>
          <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
              Live: {published ? `version ${published.version}` : 'built-in form'}
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
      {problems.length > 0 && (
        <Banner kind="warn">
          Fix before saving: {problems.slice(0, 4).join(' ')}{problems.length > 4 ? ` (+${problems.length - 4} more)` : ''}
        </Banner>
      )}

      {/* Scope tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div role="tablist" aria-label="Which form" className="inline-flex rounded-xl bg-white border border-slate-200 p-1">
          {Object.values(SCOPES).map((s) => (
            <button key={s.id} role="tab" type="button" aria-selected={scope === s.id} onClick={() => setScope(s.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold ${scope === s.id ? 'bg-ocs-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {s.label} form
            </button>
          ))}
        </div>
        <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer ml-auto">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
        {mode !== 'rules' && <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
          <button type="button" onClick={() => setPreview(preview === 'web' ? null : 'web')} aria-pressed={preview === 'web'}
            className={`px-3 py-2 text-xs font-bold inline-flex items-center gap-1 ${preview === 'web' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Monitor className="w-3.5 h-3.5" /> Preview web
          </button>
          <button type="button" onClick={() => setPreview(preview === 'mobile' ? null : 'mobile')} aria-pressed={preview === 'mobile'}
            className={`px-3 py-2 text-xs font-bold inline-flex items-center gap-1 border-l border-slate-200 ${preview === 'mobile' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Smartphone className="w-3.5 h-3.5" /> Preview mobile
          </button>
        </div>}
      </div>

      {mode === 'rules' ? (
        <RulesEditor config={working} scope={scope} showArchived={showArchived} update={update} />
      ) : (
      <div className={preview ? 'grid gap-4 xl:grid-cols-[1fr_380px]' : ''}>
        <div className="space-y-3">
          {sections.map((section) => {
            const fields = fieldsForSection(working, section.id, { includeArchived: showArchived });
            const customLive = sections.filter((s) => !s.system && !s.archived);
            const idx = customLive.findIndex((s) => s.id === section.id);
            return (
              <div key={section.id} className={`bg-white rounded-2xl border shadow-sm ${section.archived ? 'border-dashed border-slate-300 opacity-70' : 'border-slate-200'}`}>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                  <LayoutList className="w-4 h-4 text-sky-600 shrink-0" />
                  <h3 className="font-bold text-slate-800 text-sm">{section.label}</h3>
                  {section.system && <Badge icon={Lock}>Built-in section</Badge>}
                  {section.archived && <Badge>Archived</Badge>}
                  <div className="ml-auto flex items-center gap-1">
                    {!section.system && !section.archived && (
                      <>
                        <IconBtn label={`Move section ${section.label} up`} disabled={idx <= 0} onClick={() => moveSection(section, -1)} icon={ChevronUp} />
                        <IconBtn label={`Move section ${section.label} down`} disabled={idx === customLive.length - 1} onClick={() => moveSection(section, 1)} icon={ChevronDown} />
                      </>
                    )}
                    <IconBtn label={`Rename section ${section.label}`} onClick={() => renameSection(section)} icon={Pencil} />
                    {!section.system && (
                      <IconBtn label={`${section.archived ? 'Restore' : 'Archive'} section ${section.label}`}
                        onClick={() => toggleSectionArchived(section)} icon={section.archived ? ArchiveRestore : Archive} />
                    )}
                  </div>
                </div>

                <ul className="divide-y divide-slate-100">
                  {fields.map((field) => {
                    const customInSection = fields.filter((f) => !f.system && !f.archived);
                    const fIdx = customInSection.findIndex((f) => f.id === field.id);
                    return (
                      <li key={field.id} className={`px-4 py-2.5 flex items-center gap-2 ${field.archived ? 'opacity-60' : ''}`}>
                        <button type="button" onClick={() => setEditingFieldId(field.id)} className="min-w-0 flex-1 text-left group">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800 group-hover:text-ocs-600">{field.label}</span>
                            <Badge>{FIELD_TYPES[field.type]?.label}</Badge>
                            {field.system && <Badge icon={Lock}>Built-in</Badge>}
                            {field.required && <Badge tone="rose">Required</Badge>}
                            {field.hidden && <Badge icon={EyeOff}>Hidden until a rule shows it</Badge>}
                            {field.archived && <Badge>Archived</Badge>}
                          </span>
                          <span className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                            <Flag on={field.web} icon={Monitor} label="Web" />
                            <Flag on={field.mobile} icon={Smartphone} label="Mobile" />
                            {!field.system && <Flag on={field.pdf} icon={FileText} label="PDF" />}
                            {!field.system && <Flag on={field.excel} icon={FileSpreadsheet} label="Excel" />}
                            {FIELD_TYPES[field.type]?.hasOptions && !field.system && (
                              <span>{activeOptions(field).map((o) => o.label).join(' / ')}</span>
                            )}
                          </span>
                        </button>
                        {!field.system && !field.archived && (
                          <>
                            <IconBtn label={`Move ${field.label} up`} disabled={fIdx <= 0} onClick={() => moveField(field, -1)} icon={ChevronUp} />
                            <IconBtn label={`Move ${field.label} down`} disabled={fIdx === customInSection.length - 1} onClick={() => moveField(field, 1)} icon={ChevronDown} />
                          </>
                        )}
                        <IconBtn label={`Edit ${field.label}`} onClick={() => setEditingFieldId(field.id)} icon={Pencil} />
                      </li>
                    );
                  })}
                </ul>

                {!section.archived && (
                  <div className="px-4 py-2.5 border-t border-slate-100">
                    <button type="button" onClick={() => addField(section.id)}
                      className="text-xs font-bold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add field to {section.label}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" onClick={addSection}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-sky-300 text-sky-700 hover:bg-sky-50 text-sm font-bold inline-flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Add {SCOPES[scope].label.toLowerCase()} section
          </button>
          <p className="text-[11px] text-slate-500 px-1">
            Built-in fields are part of the app itself: they can be renamed and, where the app does not depend on them, hidden —
            but not deleted or changed to another type. They keep their place on screen; fields you add appear after them in their section.
          </p>
        </div>

        {preview && <FormPreview config={working} scope={scope} platform={preview} onClose={() => setPreview(null)} />}
      </div>
      )}

      {editingField && (
        <FieldEditor
          field={editingField}
          publishedField={publishedField}
          config={working}
          onChange={(next) => update((c) => {
            const i = c.fields.findIndex((f) => f.id === next.id);
            c.fields[i] = next;
          })}
          onClose={() => setEditingFieldId(null)}
        />
      )}

      {showPublish && (
        <PublishDialog
          changes={pendingChanges}
          problems={problems}
          busy={busy === 'publish'}
          nextVersion={draft ? draft.version : Math.max(0, ...versions.map((v) => v.version)) + 1}
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

function Banner({ kind, children }) {
  const cls = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-rose-50 border-rose-200 text-rose-700',
    warn: 'bg-amber-50 border-amber-200 text-amber-800'
  }[kind];
  const Icon = kind === 'ok' ? Check : AlertCircle;
  return (
    <div role={kind === 'ok' ? 'status' : 'alert'} className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${cls}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" /> <span>{children}</span>
    </div>
  );
}

function Badge({ children, icon: Icon, tone }) {
  const cls = tone === 'rose' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${cls}`}>
      {Icon && <Icon className="w-3 h-3" />}{children}
    </span>
  );
}

function Flag({ on, icon: Icon, label }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${on ? 'text-emerald-700' : 'text-slate-300 line-through'}`} title={`${label}: ${on ? 'on' : 'off'}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

function IconBtn({ label, onClick, icon: Icon, disabled }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent">
      <Icon className="w-4 h-4" />
    </button>
  );
}

function Toggle({ id, label, checked, onChange, disabled, hint }) {
  return (
    <label htmlFor={id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${disabled ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-slate-200 hover:bg-slate-50 cursor-pointer'}`}>
      <input id={id} type="checkbox" className="mt-0.5 w-4 h-4" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function FieldEditor({ field, publishedField, config, onChange, onClose }) {
  useEscapeKey(onClose);
  const set = (patch) => onChange({ ...field, ...patch });
  const typeInfo = FIELD_TYPES[field.type];
  const wasPublished = !!field.publishedOnce;
  const sectionsInScope = sectionsForScope(config, field.scope);
  const otherKeys = config.fields.filter((f) => f.scope === field.scope && f.id !== field.id).map((f) => f.key);

  const setLabel = (label) => {
    const patch = { label };
    // Until a field has been published its internal key follows its name.
    if (!field.system && !wasPublished) patch.key = makeFieldKey(label || 'field', otherKeys);
    set(patch);
  };

  const setOptions = (fn) => set({ options: fn(clone(field.options || [])) });
  const addOption = () => {
    const label = prompt('Option text:');
    if (!label || !label.trim()) return;
    setOptions((opts) => {
      const base = label.trim();
      let value = base;
      let n = 2;
      while (opts.some((o) => o.value.toLowerCase() === value.toLowerCase())) value = `${base} ${n++}`;
      opts.push({ id: newId('opt'), value, label: base, archived: false, order: Math.max(-1, ...opts.map((o) => o.order)) + 1 });
      return opts;
    });
  };
  const moveOption = (id, dir) => setOptions((opts) => {
    const list = [...opts].sort((a, b) => a.order - b.order);
    const i = list.findIndex((o) => o.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return opts;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((o, idx) => { o.order = idx; });
    return list;
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="field-editor-title"
        className="w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center gap-2 z-10">
          <h3 id="field-editor-title" className="font-bold text-slate-900 flex-1 truncate">
            {field.system ? 'Built-in field' : wasPublished ? 'Edit field' : 'New field'}
          </h3>
          <button type="button" aria-label="Close field editor" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {field.system && (
            <Banner kind="warn">
              Part of the app itself: rename it{field.lockVisible ? '' : ' or hide it'} here. Its type and storage cannot change.
            </Banner>
          )}

          <div>
            <label htmlFor="fe-label" className="block text-xs font-semibold text-slate-700 mb-1">Field name *</label>
            <input id="fe-label" className={input} value={field.label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
            {field.system && field.label !== field.defaultLabel && (
              <button type="button" onClick={() => set({ label: field.defaultLabel })} className="text-[11px] font-semibold text-sky-700 mt-1 inline-flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Reset to "{field.defaultLabel}"
              </button>
            )}
            <p className="text-[11px] text-slate-400 mt-1">
              Stored as <code className="font-mono">{field.key}</code>{wasPublished && !field.system ? ' (fixed once published, so recorded answers stay linked)' : ''}
            </p>
          </div>

          {!field.system && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fe-type" className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select id="fe-type" className={input} value={field.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      set({ type, options: FIELD_TYPES[type].hasOptions ? field.options || [] : [] });
                    }}>
                    {Object.values(FIELD_TYPES).map((t) => {
                      const allowed = canChangeType(publishedField?.type || field.type, t.id, { published: wasPublished }) || t.id === field.type;
                      return (
                        <option key={t.id} value={t.id} disabled={!allowed}>
                          {t.label}{!t.available ? ' (coming later)' : !allowed ? ' (would change recorded answers)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label htmlFor="fe-section" className="block text-xs font-semibold text-slate-700 mb-1">Section</label>
                  <select id="fe-section" className={input} value={field.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>
                    {sectionsInScope.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              {wasPublished && (
                <p className="text-[11px] text-slate-500 -mt-2">
                  To change to an incompatible type, archive this field and add a new one — past answers then keep their meaning.
                </p>
              )}

              <div>
                <label htmlFor="fe-help" className="block text-xs font-semibold text-slate-700 mb-1">Help text</label>
                <input id="fe-help" className={input} value={field.helpText} onChange={(e) => set({ helpText: e.target.value })} maxLength={200} />
              </div>
              {['text', 'textarea', 'number', 'checkbox'].includes(field.type) && (
                <div>
                  <label htmlFor="fe-placeholder" className="block text-xs font-semibold text-slate-700 mb-1">
                    {field.type === 'checkbox' ? 'Checkbox text' : 'Placeholder'}
                  </label>
                  <input id="fe-placeholder" className={input} value={field.placeholder} onChange={(e) => set({ placeholder: e.target.value })} maxLength={80} />
                </div>
              )}
            </>
          )}

          {typeInfo?.hasOptions && !field.system && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Dropdown options</span>
                <button type="button" onClick={addOption} className="text-xs font-bold text-sky-700 inline-flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add option
                </button>
              </div>
              <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {[...(field.options || [])].sort((a, b) => a.order - b.order).map((o, i, arr) => (
                  <li key={o.id} className={`flex items-center gap-1.5 px-2 py-1.5 ${o.archived ? 'opacity-60' : ''}`}>
                    <input aria-label={`Option ${i + 1} text`} className={`${input} py-1.5`} value={o.label}
                      onChange={(e) => setOptions((opts) => { opts.find((x) => x.id === o.id).label = e.target.value; return opts; })} />
                    {o.archived && <Badge>Archived</Badge>}
                    <IconBtn label={`Move option ${o.label} up`} disabled={i === 0} onClick={() => moveOption(o.id, -1)} icon={ChevronUp} />
                    <IconBtn label={`Move option ${o.label} down`} disabled={i === arr.length - 1} onClick={() => moveOption(o.id, 1)} icon={ChevronDown} />
                    <IconBtn label={`${o.archived ? 'Restore' : 'Archive'} option ${o.label}`}
                      onClick={() => setOptions((opts) => { const x = opts.find((y) => y.id === o.id); x.archived = !x.archived; return opts; })}
                      icon={o.archived ? ArchiveRestore : Archive} />
                  </li>
                ))}
                {!field.options?.length && <li className="px-3 py-3 text-xs text-slate-400">No options yet.</li>}
              </ul>
              <p className="text-[11px] text-slate-500">
                Archived options are no longer offered, but answers that already use them are kept and still shown.
                Renaming an option changes its label everywhere, including past answers.
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Toggle id="fe-required" label="Required" checked={field.required} disabled={field.system}
              onChange={(v) => set({ required: v })}
              hint={field.system ? 'Built-in fields keep their own checks. A rule can still make photos required.' : 'Checked when the facility is submitted — never blocks saving work in progress.'} />
            <Toggle id="fe-hidden" label="Hidden until a rule shows it" checked={field.hidden} disabled={field.lockVisible}
              onChange={(v) => set({ hidden: v })}
              hint={field.lockVisible ? 'The app depends on this field being on screen.' : 'Keeps recorded answers; only stops it being shown.'} />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Where it appears</p>
            <div className="grid grid-cols-2 gap-2">
              <Toggle id="fe-web" label="Web portal" checked={field.web} disabled={field.lockVisible} onChange={(v) => set({ web: v })} />
              <Toggle id="fe-mobile" label="Mobile app" checked={field.mobile} disabled={field.lockVisible} onChange={(v) => set({ mobile: v })} />
              {!field.system && <Toggle id="fe-pdf" label="PDF report" checked={field.pdf} onChange={(v) => set({ pdf: v })} />}
              {!field.system && <Toggle id="fe-excel" label="Excel report" checked={field.excel} onChange={(v) => set({ excel: v })} />}
            </div>
            {field.system && (
              <p className="text-[11px] text-slate-500 mt-2">Report columns for built-in fields are set in the Report Builder (Reports menu).</p>
            )}
          </div>

          {!field.system && (
            <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
              <button type="button"
                onClick={() => {
                  if (!field.archived && !confirm(`Archive "${field.label}"?\n\nIt stops appearing for new work. Answers already recorded are kept and still appear in reports. You can restore it later.`)) return;
                  set({ archived: !field.archived });
                }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5">
                {field.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                {field.archived ? 'Restore field' : 'Archive field'}
              </button>
              <span className="text-[11px] text-slate-500">Fields are never deleted, so no recorded answer is ever lost.</span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-ocs-600 hover:bg-ocs-500 text-white text-sm font-bold">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function FormPreview({ config, scope, platform, onClose }) {
  const [record, setRecord] = useState(scope === 'facility' ? { custom: {} } : { customValues: {}, photos: [] });
  useEffect(() => { setRecord(scope === 'facility' ? { custom: {} } : { customValues: {}, photos: [] }); }, [scope]);
  const bucket = scope === 'facility' ? 'custom' : 'customValues';
  const onChangeValue = (key, value) => setRecord((r) => ({ ...r, [bucket]: { ...(r[bucket] || {}), [key]: value } }));
  const sections = sectionsForScope(config, scope);

  return (
    <aside className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3 self-start xl:sticky xl:top-4" aria-label="Form preview">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-sky-600" />
        <p className="text-sm font-bold text-slate-800 flex-1">Preview — {platform === 'mobile' ? 'mobile app' : 'web portal'}</p>
        <IconBtn label="Close preview" onClick={onClose} icon={X} />
      </div>
      <p className="text-[11px] text-slate-500">
        Custom fields of this draft, with rules applied as you fill them in. Nothing typed here is saved.
      </p>
      <div className={platform === 'mobile' ? 'mx-auto max-w-[360px]' : ''}>
        <FormsConfigPreview config={config} platform={platform}>
          {sections.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-3 mb-3">
              <p className="text-xs font-bold uppercase text-slate-500 mb-2">{s.label}</p>
              <CustomFieldList scope={scope} sectionId={s.id} record={record} onChangeValue={onChangeValue}
                idPrefix={`preview-${s.id}`} variant={scope} />
              {!fieldsForSection(config, s.id).some((f) => !f.system) && (
                <p className="text-[11px] text-slate-400">Built-in fields only.</p>
              )}
            </div>
          ))}
        </FormsConfigPreview>
      </div>
    </aside>
  );
}

function PublishDialog({ changes, problems, busy, nextVersion, onCancel, onPublish }) {
  const [notes, setNotes] = useState('');
  useEscapeKey(onCancel, !busy);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="w-full max-w-xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 id="publish-title" className="font-bold text-slate-900">Publish version {nextVersion}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Goes live on the web portal straight away, and on phones the next time they are online. Survey data already recorded is not changed.
          </p>
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
            <label htmlFor="publish-notes" className="block text-xs font-semibold text-slate-700 mb-1">Note for the change history (optional)</label>
            <input id="publish-notes" className={input} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200}
              placeholder="e.g. Added Asset Criticality for the ADEC contract" />
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
      <div role="dialog" aria-modal="true" aria-labelledby="history-title" className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <h3 id="history-title" className="font-bold text-slate-900 flex-1">Version history</h3>
          <button type="button" aria-label="Close version history" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-slate-100">
          {!ordered.length && <p className="p-5 text-sm text-slate-500">Nothing published yet. The app uses its built-in form.</p>}
          {ordered.map((v) => {
            const prev = previousPublished(v);
            const lines = describeChanges(prev?.config || defaultFormsConfig(), v.config);
            const open = openId === v.id;
            return (
              <div key={v.id} className="px-5 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 text-sm">Version {v.version}</span>
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${statusCls[v.status]}`}>{v.status}</span>
                  <span className="text-[11px] text-slate-500">
                    {v.publishedAt ? `published ${fmtDate(v.publishedAt)}` : `created ${fmtDate(v.createdAt)}`}
                  </span>
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
