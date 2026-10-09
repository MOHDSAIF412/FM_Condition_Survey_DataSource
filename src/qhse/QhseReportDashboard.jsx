import React, { useState, useMemo } from 'react';
import { isDeletedInspection } from './lifecycle';
import { isQhse } from './model';
import { stageOf, STAGE_BY_KEY } from '../utils/workflow';
import QhseReportDownloads from './QhseReportDownloads';

export default function QhseReportDashboard({ projects = [], surveys = [], initialProjectId, canDownloadReports }) {
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
  const [selected, setSelected] = useState(new Set()), [query, setQuery] = useState('');
  const records = useMemo(() => surveys.filter(s => s.projectId === projectId && isQhse(s) && !isDeletedInspection(s)), [surveys, projectId]);
  const visible = records.filter(s => [s.facility?.qhse?.reportNumber, s.facility?.qhse?.auditTitle, s.facility?.address].some(v => String(v || '').toLowerCase().includes(query.toLowerCase())));
  const chosen = records.filter(s => selected.has(s.id));
  function toggle(id) { setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  return <section className="max-w-5xl mx-auto space-y-5">
    <div className="rounded-2xl bg-[#293771] p-6 text-white"><h2 className="text-xl font-bold">Generate QHSE Reports</h2><p className="mt-2 text-sm text-blue-100">Choose inspections to download an OCS report with findings, photos, individual remarks and sign-off. Multiple inspections are combined in one PDF or Excel workbook.</p></div>
    <div className="rounded-2xl border bg-white p-5 space-y-4">
      <label className="block text-sm font-semibold text-slate-700">QHSE project<select className="mt-2 w-full rounded-lg border p-3 bg-white" value={projectId} onChange={e => { setProjectId(e.target.value); setSelected(new Set()); }}><option value="">Select a project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.projectNumber} · {p.name}</option>)}</select></label>
      <label className="block text-sm font-semibold text-slate-700">Search inspections<input className="mt-2 w-full rounded-lg border p-3 font-normal" value={query} onChange={e => setQuery(e.target.value)} placeholder="Report number, title or location" /></label>
      <p className="text-sm text-slate-500">{records.length} inspections · {chosen.length} selected</p>
      <div className="max-h-[32rem] overflow-y-auto divide-y rounded-xl border">{visible.map(s => <label key={s.id} className="flex gap-3 p-4 items-start cursor-pointer"><input type="checkbox" className="mt-1" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /><div className="flex-1"><p className="font-semibold text-[#293771]">{s.facility?.qhse?.reportNumber || 'Report number pending'} · {s.facility?.qhse?.auditTitle || 'QHSE Site Inspection Report'}</p><p className="text-sm text-slate-600 mt-1">{s.facility?.address}</p><p className="text-xs text-slate-500 mt-2">{s.photoCount ?? s.items?.reduce((n,i) => n + (i.photos || []).length, 0) ?? 0} photos · {STAGE_BY_KEY[stageOf(s)].label}</p></div></label>)}{!visible.length && <p className="p-6 text-slate-500">No QHSE inspections found for this project and search.</p>}</div>
      <QhseReportDownloads key={projectId} records={chosen} projectId={projectId} canExport={canDownloadReports} />
      {!canDownloadReports && <p className="text-sm text-slate-600">Your role does not have permission to download reports.</p>}
    </div>
  </section>;
}
