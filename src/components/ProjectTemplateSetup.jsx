import React, { useState } from 'react';
import { ChevronDown, Pencil, LayoutList, Lock, Save } from 'lucide-react';
import { useFormsConfig } from '../config/FormsConfigContext';
import { standardProjectTemplate, projectTemplateCopy, templateFields, templatesForModule, toggleTemplateField, addTemplateField } from '../utils/projectTemplates';

const input = 'w-full min-w-0 min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm';

export default function ProjectTemplateSetup({ module = 'condition', library = false, templates = [], value, onChange, onSaveTemplate, disabled = false }) {
  const { config } = useFormsConfig();
  const standard = standardProjectTemplate(module, config);
  const selected = value || standard;
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newField, setNewField] = useState({ label: '', scope: '', type: 'text' });
  const options = [standard, ...templatesForModule(templates, module)];
  const fields = templateFields(selected);
  const visibleFields = fields.filter(f => f.label.toLowerCase().includes(search.toLowerCase()));
  const groups = [...new Set(fields.map(f => f.group))];
  const choose = id => {
    onChange(projectTemplateCopy(options.find(t => t.id === id) || standard, module, config));
    setMessage(''); setSearch('');
  };
  const save = async () => {
    if (!saveName.trim()) { setMessage('Enter a name for the new template.'); return; }
    setSaving(true); setMessage('');
    try {
      const saved = await onSaveTemplate({ ...selected, id: null, standard: false, name: saveName.trim(), archived: false });
      onChange(projectTemplateCopy(saved, module, config)); setSaveName(''); setMessage('Template saved. It is available for future projects.');
    } catch (e) { setMessage(e.message || 'Could not save this template.'); }
    finally { setSaving(false); }
  };
  return <section className="rounded-2xl border border-ocs-100 bg-slate-50/70 p-4 sm:p-5 space-y-4 min-w-0" aria-label="Project template">
    <div className="flex gap-3 items-start"><LayoutList className="text-ocs-600 shrink-0 mt-1" size={21}/><div><h3 className="text-base font-bold text-slate-900">{library ? 'Template builder' : 'Project template'}</h3><p className="text-xs text-slate-500 mt-1">Choose a standard or saved template. New records in this project use its field layout and checklist.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="block text-xs font-semibold text-slate-700">Template<select aria-label="Template" disabled={disabled || saving} className={`${input} mt-1.5`} value={options.some(t => t.id === selected.id) ? selected.id : standard.id} onChange={e => choose(e.target.value)}>{options.map(t => <option key={t.id} value={t.id}>{t.name}{t.standard ? ' (default)' : ''}</option>)}</select></label>
      <button type="button" disabled={disabled || saving} aria-expanded={editing} onClick={() => setEditing(v => !v)} className="inline-flex justify-center items-center gap-2 min-h-11 rounded-xl border border-ocs-200 bg-white px-4 text-sm font-semibold text-ocs-600"><Pencil size={16}/>{editing ? 'Close editor' : library ? 'Edit template copy' : 'Edit project copy'}<ChevronDown size={16}/></button>
    </div>
    <p className="text-xs text-slate-500">{fields.filter(f => f.visible).length} fields selected{selected.items?.length ? ` · ${selected.items.length} checklist items` : ''}. {library ? 'Save a new template to reuse this layout.' : 'Changes apply to this project only.'} The standard remains available.</p>
    {editing && <fieldset disabled={disabled || saving} className="space-y-4 min-w-0">
      <label className="block text-xs font-semibold text-slate-700">Find a field<input className={`${input} mt-1.5`} type="search" placeholder="Search field names…" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="grid lg:grid-cols-2 gap-4">{groups.map(group => <details open key={group} className="rounded-xl border bg-white p-3 space-y-2 min-w-0"><summary className="min-h-11 flex items-center text-sm font-bold text-ocs-600 px-1 cursor-pointer">{group} · {fields.filter(f => f.group === group && f.visible).length} selected</summary>{visibleFields.filter(f => f.group === group).map(f => <label key={f.key} className="flex min-h-11 items-center gap-3 rounded-lg p-2 hover:bg-slate-50 text-sm"><input type="checkbox" className="w-4 h-4 shrink-0 accent-[#293771]" checked={f.visible || f.locked} disabled={f.locked} onChange={e => onChange(toggleTemplateField(selected, f.key, e.target.checked))}/><span className="flex-1 min-w-0 break-words">{f.label}</span>{f.locked && <Lock size={13} aria-label="Required or calculation field" className="shrink-0 text-slate-400"/>}</label>)}</details>)}</div>
      {(selected.items || []).length > 0 && <div className="rounded-xl border bg-white p-3 space-y-3"><h4 className="text-xs font-bold text-ocs-600">Starting checklist</h4>{selected.items.map((item, i) => <label key={item.id || i} className="block text-xs font-semibold text-slate-500">Item {i + 1}<textarea className={`${input} mt-1`} rows={2} value={item.description} onChange={e => onChange({ ...selected, standard: false, items: selected.items.map((it, n) => n === i ? { ...it, description: e.target.value } : it) })}/></label>)}</div>}
      <p className="text-xs text-slate-500">Required fields and calculation fields stay enabled. Hiding a field does not delete recorded data.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] gap-3 items-end border-t pt-4">
        <label className="block text-xs font-semibold text-slate-700">New field name<input className={`${input} mt-1.5`} value={newField.label} onChange={e => setNewField(v => ({ ...v, label: e.target.value }))}/></label>
        <label className="block text-xs font-semibold text-slate-700">Add to<select aria-label="Add to" className={`${input} mt-1.5`} value={newField.scope || (module === 'condition' ? 'facility' : module === 'qhse' ? 'inspection' : 'header')} onChange={e => setNewField(v => ({ ...v, scope: e.target.value }))}>{(module === 'condition' ? [['facility','Facility'],['snag','Each snag']] : module === 'qhse' ? [['inspection','Inspection'],['finding','Each finding']] : [['header','Mapping'],['meter','Each meter']]).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-xs font-semibold text-slate-700">Field type<select aria-label="Field type" className={`${input} mt-1.5`} value={newField.type} onChange={e => setNewField(v => ({ ...v, type: e.target.value }))}>{[['text','Text'],['textarea','Long text'],['number','Number'],['date','Date']].map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button type="button" disabled={!newField.label.trim()} onClick={() => { onChange(addTemplateField(selected, { ...newField, scope: newField.scope || (module === 'condition' ? 'facility' : module === 'qhse' ? 'inspection' : 'header') })); setNewField(v => ({ ...v, label: '' })); }} className="min-h-11 rounded-xl border bg-white px-4 text-sm font-semibold text-ocs-600 disabled:opacity-50">Add field</button>
      </div>
      {onSaveTemplate && <div className="border-t pt-4 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end"><label className="block text-xs font-semibold text-slate-700">Save as a reusable template<input className={`${input} mt-1.5`} value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="New template name"/></label><button type="button" onClick={save} disabled={saving} className="min-h-11 inline-flex gap-2 items-center justify-center rounded-xl px-4 bg-ocs-600 text-white font-semibold text-sm"><Save size={16}/>{saving ? 'Saving…' : 'Save new template'}</button></div>}
    </fieldset>}
    {message && <p role="status" className="text-sm text-ocs-600">{message}</p>}
  </section>;
}
