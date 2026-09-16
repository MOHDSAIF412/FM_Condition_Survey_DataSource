import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Plus, Loader2, AlertCircle, Archive, ArchiveRestore, Copy, Pencil,
  Trash2, ChevronUp, ChevronDown, Search, Library, Building2, X, Check, RefreshCw
} from 'lucide-react';
import { DEPARTMENTS, PRIORITY_LEVELS, FACILITY_TYPES, facilityTypeOf, facilityCode } from '../types/survey';
import { SNAG_TEMPLATES } from '../data/snagTemplates';
import {
  listTemplates, saveTemplate, setTemplateArchived, validateTemplate, normaliseTemplateItem
} from '../utils/templates';
import { loadSurveyForReading } from '../utils/surveyLoader';

const blankTemplate = () => ({ id: null, name: '', description: '', facilityType: '', items: [] });

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white';

/**
 * Admin-only: build the checklists surveyors start facilities from.
 *
 * The database is the real boundary -- only administrators can write to
 * `inspection_templates` -- so this screen being reachable only by admins is
 * convenience, not security.
 */
export default function TemplateManager({ facilities = [], projects = [] }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);     // template being edited
  const [original, setOriginal] = useState('');     // JSON of it when opened, to spot unsaved changes
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [picker, setPicker] = useState(null);       // 'library' | 'facility' | null

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setTemplates(await listTemplates());
    } catch (err) {
      setError(err.message || 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const visible = templates.filter((t) => showArchived || !t.archived);
  const archivedCount = templates.filter((t) => t.archived).length;
  const dirty = editing && JSON.stringify(editing) !== original;

  const openEditor = (template) => {
    const copy = JSON.parse(JSON.stringify(template));
    setEditing(copy);
    setOriginal(JSON.stringify(copy));
    setError('');
    setNotice('');
    setPicker(null);
  };

  const closeEditor = () => {
    if (dirty && !confirm('Discard the changes to this template?')) return;
    setEditing(null);
    setPicker(null);
  };

  const duplicate = (t) => openEditor({ ...t, id: null, archived: false, name: `${t.name} (copy)`,
    items: t.items.map((i) => normaliseTemplateItem({ ...i, id: null })) });

  const handleSave = async () => {
    const problems = validateTemplate(editing);
    if (problems.length) { setError(problems.join(' ')); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await saveTemplate(editing);
      setTemplates((prev) => [saved, ...prev.filter((t) => t.id !== saved.id)]);
      setEditing(null);
      setPicker(null);
      setNotice(`Saved "${saved.name}" with ${saved.items.length} checklist item${saved.items.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message || 'Could not save the template.');
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (t) => {
    if (!t.archived && !confirm(`Archive "${t.name}"?\n\nSurveyors will no longer be offered it. Facilities already started from it are not affected, and you can restore it at any time.`)) return;
    setBusyId(t.id);
    setError('');
    try {
      const saved = await setTemplateArchived(t.id, !t.archived);
      setTemplates((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      setNotice(saved.archived ? `Archived "${saved.name}".` : `Restored "${saved.name}".`);
    } catch (err) {
      setError(err.message || 'Could not change that template.');
    } finally {
      setBusyId(null);
    }
  };

  // --- editor item helpers ---
  const setItems = (fn) => setEditing((prev) => ({ ...prev, items: fn(prev.items) }));
  const updateItem = (idx, field, value) =>
    setItems((items) => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const moveItem = (idx, dir) => setItems((items) => {
    const next = [...items];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return items;
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });
  const addItems = (newOnes) => {
    const have = new Set(editing.items.map((i) => (i.description || '').trim().toLowerCase()));
    const fresh = [];
    for (const raw of newOnes) {
      const d = (raw.description || '').trim().toLowerCase();
      if (!d || have.has(d)) continue;
      have.add(d);
      fresh.push(normaliseTemplateItem({ ...raw, id: null }));
    }
    if (fresh.length) setItems((items) => [...items, ...fresh]);
    return fresh.length;
  };

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        onChange={setEditing}
        dirty={dirty}
        saving={saving}
        error={error}
        onSave={handleSave}
        onCancel={closeEditor}
        updateItem={updateItem}
        moveItem={moveItem}
        removeItem={(idx) => setItems((items) => items.filter((_, i) => i !== idx))}
        addBlank={() => setItems((items) => [...items, normaliseTemplateItem({ department: 'GENERAL' })])}
        picker={picker}
        setPicker={setPicker}
        addItems={addItems}
        facilities={facilities}
        projects={projects}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-8">
      <div className="bg-gradient-to-r from-ocs-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5" /> Inspection Templates
          </h2>
          <p className="text-sky-200/80 text-xs mt-1">
            Standard checklists for each type of facility. Surveyors start a facility from one, so every site is checked the same way.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openEditor(blankTemplate())}
          className="px-4 py-2.5 rounded-xl bg-flame-500 hover:bg-flame-600 text-white font-bold text-sm inline-flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {notice && (
        <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" /> {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
          {visible.length} template{visible.length === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-3">
          {archivedCount > 0 && (
            <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived ({archivedCount})
            </label>
          )}
          <button type="button" onClick={refresh} className="text-xs font-semibold text-ocs-600 inline-flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {loading && !templates.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading templates…
        </div>
      ) : !visible.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-700">No templates yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Create one for each type of facility you survey — for example a school checklist covering fire safety, electrical and plumbing.
            You can build it from the common defects library or copy the snags of a facility you have already surveyed.
          </p>
          <button
            type="button"
            onClick={() => openEditor(blankTemplate())}
            className="px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold text-xs inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Create the first template
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((t) => {
            const type = facilityTypeOf({ facilityType: t.facilityType });
            const depts = [...new Set(t.items.map((i) => i.department))];
            const urgent = t.items.filter((i) => i.priority === 1).length;
            return (
              <div key={t.id} className={`bg-white rounded-2xl border p-4 shadow-sm flex flex-col gap-3 ${t.archived ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 truncate">{t.name}</h3>
                    {t.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{t.description}</p>}
                  </div>
                  {t.archived && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 shrink-0">Archived</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold">
                  <span className={`px-2 py-0.5 rounded-full border ${type ? type.badge : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {type ? type.name : 'Any facility type'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                    {t.items.length} item{t.items.length === 1 ? '' : 's'}
                  </span>
                  {urgent > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">{urgent} × P1</span>
                  )}
                </div>

                {depts.length > 0 && (
                  <p className="text-[11px] text-slate-500 truncate">
                    {depts.map((d) => (DEPARTMENTS[d]?.name || d).split('&')[0].trim()).join(' · ')}
                  </p>
                )}

                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 mt-auto">
                  {!t.archived && (
                    <button type="button" onClick={() => openEditor(t)}
                      className="px-3 py-1.5 rounded-lg bg-ocs-600 hover:bg-ocs-500 text-white text-xs font-bold inline-flex items-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  <button type="button" onClick={() => duplicate(t)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1">
                    <Copy className="w-3.5 h-3.5" /> Duplicate
                  </button>
                  <button type="button" onClick={() => toggleArchive(t)} disabled={busyId === t.id}
                    className="ml-auto px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                    {busyId === t.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : t.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    {t.archived ? 'Restore' : 'Archive'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  template, onChange, dirty, saving, error, onSave, onCancel,
  updateItem, moveItem, removeItem, addBlank, picker, setPicker, addItems, facilities, projects
}) {
  const [lastAdded, setLastAdded] = useState('');
  const set = (field, value) => onChange((prev) => ({ ...prev, [field]: value }));

  const onAdd = (list, source) => {
    const n = addItems(list);
    setLastAdded(n ? `Added ${n} item${n === 1 ? '' : 's'} from ${source}.` : `Nothing new — those items are already in the checklist.`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-28">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-[12px] font-semibold text-ocs-600 hover:text-ocs-700">
          &larr; All templates
        </button>
        {dirty && <span className="text-[11px] font-semibold text-amber-600">Unsaved changes</span>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">{template.id ? 'Edit template' : 'New template'}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tpl-name" className="block text-xs font-semibold text-slate-700 mb-1">Template name *</label>
            <input id="tpl-name" className={inputCls} value={template.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />
          </div>
          <div>
            <label htmlFor="tpl-type" className="block text-xs font-semibold text-slate-700 mb-1">Facility type</label>
            <select id="tpl-type" className={inputCls} value={template.facilityType} onChange={(e) => set('facilityType', e.target.value)}>
              <option value="">Any facility type</option>
              {Object.values(FACILITY_TYPES).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              When a surveyor picks this type, this template is suggested automatically.
            </p>
          </div>
        </div>
        <div>
          <label htmlFor="tpl-desc" className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
          <textarea id="tpl-desc" rows={2} className={inputCls} value={template.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 mr-auto">
            Checklist ({template.items.length})
          </h3>
          <button type="button" onClick={() => setPicker(picker === 'library' ? null : 'library')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 border ${picker === 'library' ? 'bg-ocs-600 text-white border-ocs-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
            <Library className="w-3.5 h-3.5" /> From defects library
          </button>
          <button type="button" onClick={() => setPicker(picker === 'facility' ? null : 'facility')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 border ${picker === 'facility' ? 'bg-ocs-600 text-white border-ocs-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
            <Building2 className="w-3.5 h-3.5" /> Copy from a facility
          </button>
          <button type="button" onClick={addBlank}
            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add item
          </button>
        </div>

        {lastAdded && <p role="status" className="text-xs font-semibold text-emerald-700">{lastAdded}</p>}

        {picker === 'library' && (
          <LibraryPicker onAdd={(list) => onAdd(list, 'the defects library')} onClose={() => setPicker(null)} />
        )}
        {picker === 'facility' && (
          <FacilityPicker facilities={facilities} projects={projects}
            onAdd={(list, name) => onAdd(list, name)} onClose={() => setPicker(null)} />
        )}

        {!template.items.length ? (
          <p className="text-sm text-slate-400 text-center py-8">
            No checklist items yet. Add them one by one, pick from the defects library, or copy a surveyed facility.
          </p>
        ) : (
          <ol className="space-y-2">
            {template.items.map((item, idx) => (
              <li key={item.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-slate-400 w-6 pt-2 shrink-0">{idx + 1}.</span>
                  <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-12">
                    <input
                      aria-label={`Item ${idx + 1} description`}
                      className={`${inputCls} sm:col-span-12`}
                      placeholder="Defect or check description"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    />
                    <select aria-label={`Item ${idx + 1} department`} className={`${inputCls} sm:col-span-4`}
                      value={item.department} onChange={(e) => updateItem(idx, 'department', e.target.value)}>
                      {Object.keys(DEPARTMENTS).map((d) => <option key={d} value={d}>{DEPARTMENTS[d].name}</option>)}
                    </select>
                    <select aria-label={`Item ${idx + 1} priority`} className={`${inputCls} sm:col-span-3`}
                      value={item.priority} onChange={(e) => updateItem(idx, 'priority', Number(e.target.value))}>
                      {[1, 2, 3, 4].map((p) => <option key={p} value={p}>{PRIORITY_LEVELS[p]?.label || `P${p}`}</option>)}
                    </select>
                    <input aria-label={`Item ${idx + 1} default location`} className={`${inputCls} sm:col-span-3`}
                      placeholder="Location (optional)" value={item.location}
                      onChange={(e) => updateItem(idx, 'location', e.target.value)} />
                    <input aria-label={`Item ${idx + 1} unit`} className={`${inputCls} sm:col-span-2`}
                      placeholder="Unit" value={item.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" aria-label={`Move item ${idx + 1} up`} disabled={idx === 0} onClick={() => moveItem(idx, -1)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                    <button type="button" aria-label={`Move item ${idx + 1} down`} disabled={idx === template.items.length - 1} onClick={() => moveItem(idx, 1)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                    <button type="button" aria-label={`Remove item ${idx + 1}`} onClick={() => removeItem(idx)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="sticky bottom-4 z-10 bg-white/95 backdrop-blur rounded-2xl border border-slate-200 shadow-lg p-3 flex items-center gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-semibold">
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-flame-500 hover:bg-flame-600 disabled:opacity-50 text-white font-bold text-sm inline-flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  );
}

function LibraryPicker({ onAdd, onClose }) {
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('ALL');
  const [chosen, setChosen] = useState(() => new Set());

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SNAG_TEMPLATES.filter((t) => (dept === 'ALL' || t.department === dept)
      && (!q || t.description.toLowerCase().includes(q)));
  }, [query, dept]);

  const toggle = (id) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="border border-sky-200 bg-sky-50/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input aria-label="Search the defects library" className={`${inputCls} pl-8`} placeholder="Search defects…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select aria-label="Filter library by department" className={`${inputCls} w-auto`} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="ALL">All departments</option>
          {[...new Set(SNAG_TEMPLATES.map((t) => t.department))].map((d) => (
            <option key={d} value={d}>{DEPARTMENTS[d]?.name || d}</option>
          ))}
        </select>
        <button type="button" aria-label="Close library" onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
        {list.map((t) => (
          <label key={t.id} className="flex items-start gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
            <input type="checkbox" className="mt-1" checked={chosen.has(t.id)} onChange={() => toggle(t.id)} />
            <span className="flex-1">{t.description}
              <span className="block text-[11px] text-slate-500">{DEPARTMENTS[t.department]?.name} · P{t.priority}</span>
            </span>
          </label>
        ))}
        {!list.length && <p className="text-sm text-slate-400 text-center py-4">Nothing matches.</p>}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setChosen(new Set(list.map((t) => t.id)))}
          className="text-xs font-semibold text-ocs-600">Select all shown ({list.length})</button>
        <button type="button" disabled={!chosen.size}
          onClick={() => { onAdd(SNAG_TEMPLATES.filter((t) => chosen.has(t.id))); setChosen(new Set()); }}
          className="ml-auto px-3 py-1.5 rounded-lg bg-sky-600 disabled:opacity-50 text-white text-xs font-bold">
          Add {chosen.size || ''} selected
        </button>
      </div>
    </div>
  );
}

function FacilityPicker({ facilities, projects, onAdd, onClose }) {
  const [facilityId, setFacilityId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const projectName = (id) => projects.find((p) => p.id === id)?.projectNumber || '';
  const label = (f) => {
    const code = f.facility?.facilityCode || facilityCode(f.facility?.facilityNumber);
    const name = f.facilityName && f.facilityName !== 'Unnamed facility' ? f.facilityName : '';
    return [projectName(f.projectId), code, name].filter(Boolean).join(' · ') + ` (${f.itemCount || 0} snag${f.itemCount === 1 ? '' : 's'})`;
  };
  const withSnags = facilities.filter((f) => (f.itemCount || 0) > 0);

  const copy = async () => {
    if (!facilityId) return;
    setLoading(true);
    setMessage('');
    try {
      const full = await loadSurveyForReading(facilityId);
      const items = (full?.items || [])
        .filter((i) => (i.defectDescription || '').trim())
        .map((i) => ({
          description: i.defectDescription, department: i.department, priority: i.priority,
          location: i.location, unit: i.unit
        }));
      if (!items.length) { setMessage('That facility has no snags with a description to copy.'); return; }
      const f = facilities.find((x) => x.id === facilityId);
      onAdd(items, f?.facilityName || 'the facility');
      setFacilityId('');
    } catch (err) {
      setMessage(err.message || 'Could not load that facility.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-sky-200 bg-sky-50/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select aria-label="Facility to copy snags from" className={`${inputCls} flex-1 min-w-[14rem]`}
          value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
          <option value="">Choose a surveyed facility…</option>
          {withSnags.map((f) => <option key={f.id} value={f.id}>{label(f)}</option>)}
        </select>
        <button type="button" disabled={!facilityId || loading} onClick={copy}
          className="px-3 py-2 rounded-lg bg-sky-600 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Copy its snags
        </button>
        <button type="button" aria-label="Close" onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        Copies each snag's description, department, priority, location and unit. Photos, costs and quantities found on site are not copied.
      </p>
      {message && <p role="alert" className="text-xs font-semibold text-rose-700">{message}</p>}
    </div>
  );
}
