import React, { useEffect, useState } from 'react';
import ProjectTemplateSetup from './ProjectTemplateSetup';
import TemplateManager from './TemplateManager';
import { listTemplates, saveTemplate, setTemplateArchived } from '../utils/templates';
import { TEMPLATE_MODULES, standardProjectTemplate, projectTemplateCopy, templatesForModule } from '../utils/projectTemplates';
import { useFormsConfig } from '../config/FormsConfigContext';

export default function ModuleTemplateManager({ facilities, projects }) {
  const { config } = useFormsConfig();
  const [module, setModule] = useState('condition');
  const [templates, setTemplates] = useState([]);
  const [value, setValue] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checklists, setChecklists] = useState(false);
  const refresh = () => listTemplates().then(setTemplates);
  useEffect(() => { refresh(); }, []);
  const save = async template => {
    const saved = await saveTemplate(template);
    setTemplates(prev => [saved, ...prev.filter(t => t.id !== saved.id)]);
    return saved;
  };
  const change = async (template, archived) => {
    setBusy(true); setError('');
    try { await setTemplateArchived(template.id, archived); await refresh(); if (value?.id === template.id) setValue(null); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="space-y-5 w-full min-w-0">
    <div className="rounded-2xl bg-ocs-800 text-white p-5 sm:p-6"><h2 className="text-xl font-bold">Inspection Templates</h2><p className="text-sm text-white/70 mt-2">Create a field template, save it, then select it when creating a project. Every project keeps its own copy.</p></div>
    <nav aria-label="Template modules" className="flex gap-2 overflow-x-auto pb-2">{Object.entries(TEMPLATE_MODULES).map(([key, label]) => <button type="button" key={key} aria-pressed={key === module} onClick={() => { setModule(key); setValue(null); setChecklists(false); setError(''); }} className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold ${key === module ? 'bg-ocs-600 text-white' : 'bg-white text-slate-700'}`}>{label}</button>)}</nav>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <ProjectTemplateSetup library key={module} module={module} templates={templates} value={value} onChange={setValue} onSaveTemplate={save} disabled={busy}/>
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <article className="rounded-xl border border-ocs-100 bg-white p-4 space-y-3"><span className="text-xs text-ocs-600 font-semibold">Standard · always available</span><h3 className="font-bold">{standardProjectTemplate(module, config).name}</h3><p className="text-xs text-slate-500">Use as the default or customize a copy.</p><button type="button" className="min-h-11 text-sm font-semibold text-ocs-600" onClick={() => setValue(standardProjectTemplate(module, config))}>Use standard</button></article>
      {templatesForModule(templates, module).map(t => <article key={t.id} className="rounded-xl border bg-white p-4 space-y-3"><span className="text-xs text-slate-500">Saved template</span><h3 className="font-bold break-words">{t.name}</h3><p className="text-xs text-slate-500">{t.items.length} checklist items{t.fieldLayout ? ' · Custom field layout' : ''}</p><div className="flex justify-between gap-3"><button type="button" disabled={busy} className="min-h-11 text-sm font-semibold text-ocs-600" onClick={() => setValue(projectTemplateCopy(t, module, config))}>Select & edit copy</button><button type="button" disabled={busy} className="min-h-11 text-xs text-slate-500" onClick={() => change(t, true)}>Archive</button></div></article>)}
    </div>
    {templates.filter(t => t.archived && (t.module || 'condition') === module).length > 0 && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-600">Archived templates</summary>{templates.filter(t => t.archived && (t.module || 'condition') === module).map(t => <div key={t.id} className="flex justify-between gap-3 items-center border-t py-2 mt-2 text-sm"><span>{t.name}</span><button type="button" disabled={busy} className="min-h-11 font-semibold text-ocs-600" onClick={() => change(t, false)}>Restore</button></div>)}</details>}
    {module === 'condition' && <div><button type="button" onClick={() => { if (checklists) refresh(); setChecklists(v => !v); }} className="min-h-11 text-sm font-semibold text-ocs-600">{checklists ? 'Close' : 'Open'} checklist builder</button>{checklists && <TemplateManager facilities={facilities} projects={projects}/>}</div>}
  </section>;
}
