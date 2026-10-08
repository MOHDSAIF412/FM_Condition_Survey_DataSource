import React, { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { captureFromCamera, pickFromGallery, photosFromFiles } from '../utils/photoCapture';
import { hydratePhotos } from '../utils/cloudSync';
import { generateSurveyPDF, generateSurveyExcel } from '../utils/reportExports';
import { createFinding, findingData, inspectionIssues, TYPES, SEVERITIES, riskColor } from './model';
import { CanvasSignaturePad } from '../components/SignatureSection';

const control = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
function Field({ label, value, onChange, multiline, ...props }) {
  const Tag = multiline ? 'textarea' : 'input';
  return <label className="block text-sm font-semibold text-slate-700">{label}<Tag {...props} className={`${control} mt-1 font-normal`} value={value || ''} onChange={e => onChange(e.target.value)} rows={multiline ? 3 : undefined} /></label>;
}

export function QhseHub({ surveys, projects, canEdit, cloudConfigured, onCreate, onOpen }) {
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="space-y-5">
    <h1 className="text-2xl font-bold text-[#293771]">QHSE Inspection</h1>
    <p className="text-slate-600">Record site observations and photo evidence. Export OCS reports in PDF and Excel.</p>
    {canEdit && <div className="bg-white p-5 rounded-xl border flex gap-3 flex-wrap items-end">
      <label className="text-sm flex-1 min-w-48">Save under project<select aria-label="Save under project" className={control} value={projectId} onChange={e => setProjectId(e.target.value)}>
        <option value="">{cloudConfigured ? 'Select a project' : 'Local inspection'}</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <button disabled={busy || (cloudConfigured && !projectId)} className="bg-[#293771] text-white rounded-lg px-4 py-2 disabled:opacity-50" onClick={async () => {
        setBusy(true); setError('');
        try { await onCreate(projectId || null); } catch (e) { setError(e.message); } finally { setBusy(false); }
      }}>New QHSE inspection</button>
      <p className="w-full text-xs text-slate-500">The project controls cloud access. Enter the report's project name manually inside the inspection.</p>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="grid sm:grid-cols-2 gap-3">{surveys.map(s => <button key={s.id} onClick={() => onOpen(s.id)} className="p-5 bg-white rounded-xl border text-left hover:border-[#293771]">
      <strong className="text-[#293771]">{s.facility?.qhse?.projectName || s.facilityName || 'Untitled inspection'}</strong>
      <p className="text-sm text-slate-600 mt-1">{s.facility?.address || 'Location pending'}</p>
      <p className="text-xs mt-2">{s.facility?.qhse?.reportNumber || 'Report number pending'}</p>
    </button>)}</div>
    {!surveys.length && <p className="text-slate-500">No QHSE inspections saved yet.</p>}
  </section>;
}

export default function QhseInspection({ survey, canEdit, canDelete, canExport, onFacility, onItem, onAdd, onDelete, onSignatures, onBack, onBackup }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null), targetRef = useRef(null);
  const latest = useRef(survey); latest.current = survey;
  const f = survey.facility, q = f.qhse || {};
  const updateQ = (key, value) => onFacility({ ...f, qhse: { ...q, [key]: value }, ...(key === 'projectName' ? { facilityName: value } : {}) });
  const exportReport = async format => {
    setError(''); setBusy(true);
    try {
      const issues = inspectionIssues(latest.current);
      if (issues.length) throw new Error(issues.join(' '));
      const hydrated = await hydratePhotos(latest.current);
      await (format === 'pdf' ? generateSurveyPDF : generateSurveyExcel)(hydrated);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  async function attach(id, getPhotos) {
    setError(''); setBusy(true);
    try {
      const photos = await getPhotos();
      const item = latest.current.items.find(i => i.id === id);
      if (item && photos?.length) onItem({ ...item, photos: [...item.photos, ...photos] }, { persistNow: true });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="space-y-5">
    <div className="flex flex-wrap gap-3 items-center"><button onClick={onBack} className="text-[#293771] underline">All QHSE inspections</button><h1 className="text-2xl font-bold text-[#293771] flex-1">QHSE Site Inspection</h1><button onClick={onBackup} className="text-sm underline">Backup inspection</button></div>
    {error && <div role="alert" className="p-4 bg-red-50 text-red-800 rounded-lg">{error}</div>}
    <p className="text-sm text-slate-500">Drafts and photos save automatically. Use the sync indicator above to check cloud status.</p>
    <fieldset disabled={!canEdit} className="space-y-5 min-w-0">
      <div className="bg-white border rounded-xl p-5 grid sm:grid-cols-2 gap-4">
        <Field label="Project name *" value={q.projectName} onChange={v => updateQ('projectName', v)} />
        <Field label="Audit title" value={q.auditTitle} onChange={v => updateQ('auditTitle', v)} />
        <Field label="Report number" value={q.reportNumber} onChange={v => updateQ('reportNumber', v)} />
        <Field label="Region" value={q.region} onChange={v => updateQ('region', v)} />
        <Field label="Site" value={q.site} onChange={v => updateQ('site', v)} />
        <Field label="Location / address *" value={f.address} onChange={v => onFacility({ ...f, address: v })} />
        <Field label="Conducted on" type="datetime-local" value={q.conductedOn} onChange={v => updateQ('conductedOn', v)} />
        <Field label="Prepared by" value={f.surveyorName} onChange={v => onFacility({ ...f, surveyorName: v })} />
        <Field label="Personnel" value={q.personnel} onChange={v => updateQ('personnel', v)} multiline />
        <Field label="Inspection summary" value={q.summary} onChange={v => updateQ('summary', v)} multiline />
      </div>
      <div className="flex justify-between items-center"><h2 className="text-lg font-bold">Findings ({survey.items.length})</h2><button className="bg-[#293771] text-white px-4 py-2 rounded-lg" onClick={() => onAdd(createFinding())}>Add finding</button></div>
      {survey.items.map((item, index) => {
        const data = findingData(item);
        const custom = (key, value) => onItem({ ...item, customValues: { ...item.customValues, [key]: value } });
        return <article key={item.id} className="bg-white border rounded-xl p-5 space-y-4" style={{ borderLeft: `5px solid #${riskColor(data.severity)}` }}>
          <div className="flex justify-between"><h3 className="font-bold text-[#293771]">Finding {index + 1}</h3>{canDelete && <button className="text-red-700 text-sm" onClick={() => { if (confirm('Remove this finding and its photos?')) onDelete(item.id); }}>Remove finding</button>}</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Finding location *" value={data.location} onChange={v => onItem({ ...item, location: v })} />
            <Field label="Type / safety category *" list="qhse-types" value={data.type} onChange={v => custom('qhseType', v)} />
            <label className="text-sm font-semibold">Severity *<select aria-label={`Finding ${index + 1} severity`} className={`${control} mt-1`} value={data.severity} onChange={e => custom('severity', e.target.value)}><option value="">Select severity</option>{SEVERITIES.map(s => <option key={s}>{s}</option>)}</select></label>
            <label className="text-sm font-semibold">Status<select aria-label={`Finding ${index + 1} status`} className={`${control} mt-1`} value={data.status} onChange={e => custom('findingStatus', e.target.value)}><option>Open</option><option>Closed</option></select></label>
            <Field label="CAFM reference number" value={data.cafmReference} onChange={v => custom('cafmReference', v)} />
            <Field label="Description / safety observation *" multiline value={data.description} onChange={v => onItem({ ...item, defectDescription: v })} />
          </div>
          <div className="flex flex-wrap gap-3">
            <button disabled={busy} className="text-sm underline" onClick={() => {
              if (Capacitor.isNativePlatform()) attach(item.id, async () => { const r = await captureFromCamera(); if (!r.ok && !r.cancelled) throw new Error(r.message); return r.ok ? [r.photo] : []; });
              else { targetRef.current = item.id; fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click(); }
            }}>Take photo</button>
            <button disabled={busy} className="text-sm underline" onClick={() => {
              if (Capacitor.isNativePlatform()) attach(item.id, async () => { const r = await pickFromGallery(); if (!r.ok && !r.cancelled) throw new Error(r.message); return r.ok ? r.photos : []; });
              else { targetRef.current = item.id; fileRef.current.removeAttribute('capture'); fileRef.current.click(); }
            }}>Add photos</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{data.photos.map((p, n) => <div key={p.id} className="border rounded-lg p-2">
            {p.dataUrl ? <img src={p.dataUrl} alt={`Finding ${index + 1}, photo ${n + 1}`} className="w-full h-36 object-contain" /> : <p className="text-xs">Photo available in cloud</p>}
            <Field label={`Photo ${n + 1} caption`} value={p.caption} onChange={v => onItem({ ...item, photos: item.photos.map(photo => photo.id === p.id ? { ...photo, caption: v } : photo) })} />
            {canDelete && <button className="text-xs text-red-700 mt-2" onClick={() => { if (confirm('Remove this photo?')) onItem({ ...item, photos: item.photos.filter(photo => photo.id !== p.id), _deletedPhotoId: p.id }, { persistNow: true }); }}>Remove photo</button>}
          </div>)}</div>
        </article>;
      })}
      <datalist id="qhse-types">{TYPES.map(t => <option key={t} value={t} />)}</datalist>
      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="font-bold text-[#293771]">Inspector sign-off</h2>
        <Field label="Inspector name" value={survey.signatures?.surveyor?.name} onChange={v => onSignatures({ ...survey.signatures, surveyor: { ...survey.signatures.surveyor, name: v } })} />
        <Field label="Sign-off date" type="date" value={survey.signatures?.surveyor?.date} onChange={v => onSignatures({ ...survey.signatures, surveyor: { ...survey.signatures.surveyor, date: v } })} />
        <CanvasSignaturePad label="Inspector signature" value={survey.signatures?.surveyor?.signatureData || ''} onSave={v => onSignatures({ ...survey.signatures, surveyor: { ...survey.signatures.surveyor, signatureData: v } })} />
      </div>
    </fieldset>
    <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={e => {
      const files = Array.from(e.target.files || []), id = targetRef.current; e.target.value = '';
      if (files.length) attach(id, () => photosFromFiles(files));
    }} />
    {canExport && <div className="flex gap-3 flex-wrap"><button disabled={busy} onClick={() => exportReport('pdf')} className="bg-[#293771] text-white px-5 py-3 rounded-lg disabled:opacity-50">Download PDF</button><button disabled={busy} onClick={() => exportReport('excel')} className="bg-[#F15F22] text-white px-5 py-3 rounded-lg disabled:opacity-50">Download Excel</button></div>}
  </section>;
}
