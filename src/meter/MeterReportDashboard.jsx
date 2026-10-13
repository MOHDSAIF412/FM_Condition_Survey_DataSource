import React, { useState, useMemo } from 'react';
import { isMeter, isDeletedMapping } from './model';
import { stageOf, STAGE_BY_KEY } from '../utils/workflow';
import MeterReportDownloads from './MeterReportDownloads';

export default function MeterReportDashboard({ projects = [], surveys = [], initialProjectId, canDownloadReports }) {
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
  const [selected, setSelected] = useState(new Set()), [query, setQuery] = useState('');
  const records = useMemo(() => surveys.filter(s => s.projectId === projectId && isMeter(s) && !isDeletedMapping(s)), [surveys, projectId]);
  const visible = records.filter(s => [s.facility?.meter?.branch, s.facility?.meter?.region].some(v => String(v || '').toLowerCase().includes(query.toLowerCase())));
  const chosen = records.filter(s => selected.has(s.id));
  function toggle(id) { setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  return <section className="max-w-5xl mx-auto space-y-5">
    <div className="rounded-2xl bg-[#293771] p-6 text-white"><h2 className="text-xl font-bold">Generate Meter Mapping Reports</h2><p className="mt-2 text-sm text-blue-100">Choose branch mappings to download. Multiple mappings are combined in one PDF or Excel workbook.</p></div>
    <div className="rounded-2xl border bg-white p-5 space-y-4">
      <label className="block text-sm font-semibold text-slate-700">Meter Mapping project<select className="mt-2 w-full rounded-lg border p-3 bg-white" value={projectId} onChange={e => { setProjectId(e.target.value); setSelected(new Set()); }}><option value="">Select a project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.projectNumber} · {p.name}</option>)}</select></label>
      <label className="block text-sm font-semibold text-slate-700">Search mappings<input className="mt-2 w-full rounded-lg border p-3 font-normal" value={query} onChange={e => setQuery(e.target.value)} placeholder="Branch or region" /></label>
      <p className="text-sm text-slate-500">{records.length} mappings · {chosen.length} selected</p>
      <div className="max-h-[32rem] overflow-y-auto divide-y rounded-xl border">{visible.map(s => <label key={s.id} className="flex gap-3 p-4 items-start cursor-pointer"><input type="checkbox" className="mt-1" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /><div className="flex-1"><p className="font-semibold text-[#293771]">{s.facility?.meter?.branch || 'Branch pending'} · {s.facility?.meter?.region || 'Region pending'}</p><p className="text-xs text-slate-500 mt-2">{s.itemCount ?? s.items?.length ?? 0} meters · {s.photoCount ?? s.items?.reduce((n, i) => n + (i.photos || []).length, 0) ?? 0} photos · {STAGE_BY_KEY[stageOf(s)].label}</p></div></label>)}{!visible.length && <p className="p-6 text-slate-500">No meter mappings found for this project and search.</p>}</div>
      <MeterReportDownloads key={projectId} records={chosen} projectId={projectId} canExport={canDownloadReports} />
      {!canDownloadReports && <p className="text-sm text-slate-600">Your role does not have permission to download reports.</p>}
    </div>
  </section>;
}
