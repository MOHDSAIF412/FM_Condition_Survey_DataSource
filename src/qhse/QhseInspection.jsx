import React, { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { captureFromCamera, pickFromGallery, photosFromFiles } from '../utils/photoCapture';
import { hydratePhotos } from '../utils/cloudSync';
import { generateSurveyPDF, generateSurveyExcel } from '../utils/reportExports';
import { createFinding, findingData, inspectionIssues, TYPES, SEVERITIES, riskColor, activeFields, inspectionValue, INSPECTION_FIELDS, FINDING_FIELDS } from './model';
import { CanvasSignaturePad } from '../components/SignatureSection';
import { Camera, Images } from 'lucide-react';
import BackButton from '../components/BackButton';
import { createPhotoEvidence } from './model';

const control = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
function Field({ label, value, onChange, multiline, ...props }) {
  const Tag = multiline ? 'textarea' : 'input';
  return <label className="block text-sm font-semibold text-slate-700">{label}<Tag {...props} className={`${control} mt-1 font-normal`} value={value || ''} onChange={e => onChange(e.target.value)} rows={multiline ? 3 : undefined} /></label>;
}

export function QhseHub({ surveys, legacySurveys = [], project, canEdit, onBack, onCreate, onOpen, onMove }) {
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const templates = surveys.filter(s => s.facility?.qhse?.templateName);
  return <section className="space-y-6">
    <BackButton onClick={onBack}>QHSE projects</BackButton>
    <div className="rounded-2xl bg-[#293771] text-white p-6 sm:p-8 space-y-3"><p className="text-sm text-blue-100">QHSE INSPECTION · {project?.projectNumber}</p><h1 className="text-3xl font-bold">{project?.name || 'Select a project'}</h1><p className="text-blue-100">{project?.location}</p><p className="text-sm text-blue-100">{surveys.length} inspections saved in this project</p></div>
    {canEdit && project && <div className="bg-white p-5 rounded-xl border grid sm:grid-cols-[1fr_auto] gap-4 items-end">
      <label className="text-sm font-semibold text-slate-700">Inspection template<select className={`${control} mt-2`} value={templateId} onChange={e => setTemplateId(e.target.value)}><option value="">OCS standard fields</option>{templates.map(s => <option key={s.id} value={s.id}>{s.facility.qhse.templateName}</option>)}</select></label>
      <button disabled={busy} className="bg-[#F15F22] text-white rounded-lg px-5 py-3 font-semibold disabled:opacity-50" onClick={async () => {
        setBusy(true); setError('');
        try { await onCreate(project.id, templates.find(s => s.id === templateId)?.facility?.qhse?.layout || null); } catch (e) { setError(e.message); } finally { setBusy(false); }
      }}>New inspection</button>
      <p className="text-xs text-slate-500 sm:col-span-2">Build and save a named field template inside an inspection. Templates reuse the field layout; each new report starts blank.</p>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {legacySurveys.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3"><h2 className="font-bold text-[#293771]">Older QHSE reports found</h2><p className="text-sm text-slate-600">These reports are still in Condition Survey. Move them here with their existing photos and remarks.</p>{legacySurveys.map(s => <div key={s.id} className="flex flex-wrap justify-between gap-3 items-center"><span className="text-sm font-semibold">{s.title || s.facilityName}</span>{canEdit && <button disabled={busy} className="rounded-lg bg-[#293771] text-white px-4 py-2 text-sm disabled:opacity-50" onClick={async () => { setBusy(true); setError(''); try { await onMove(s.id); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Move to QHSE</button>}</div>)}</div>}
    <h2 className="text-lg font-bold text-[#293771]">Project inspections</h2>
    <div className="grid sm:grid-cols-2 gap-4">{surveys.map(s => <button key={s.id} onClick={() => onOpen(s.id)} className="p-5 bg-white rounded-xl border text-left hover:border-[#293771] shadow-sm">
      <span className="text-xs font-semibold text-[#F15F22]">{s.facility?.qhse?.reportNumber || 'Draft report'}</span><h3 className="font-bold text-[#293771] mt-2">{s.facility?.qhse?.auditTitle || 'Site inspection report'}</h3>
      <p className="text-sm text-slate-600 mt-2">{s.facility?.address || project?.location || 'Location pending'}</p><p className="text-xs text-slate-500 mt-3">{s.itemCount ?? s.items?.length ?? 0} entries · {s.photoCount ?? s.items?.reduce((n, i) => n + (i.photos || []).length, 0) ?? 0} photos · {s.facility?.qhse?.conductedOn?.replace('T', ' ') || 'Date pending'}</p>
    </button>)}</div>
    {!surveys.length && <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">Start your first inspection for this project.</div>}
  </section>;
}

export default function QhseInspection({ project, survey, canEdit, canDelete, canExport, onFacility, onItem, onAdd, onDelete, onSignatures, onBack, onBackup }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [newField, setNewField] = useState({ label: '', scope: 'inspection', type: 'text' });
  const [templateName, setTemplateName] = useState('');
  const fileRef = useRef(null), targetRef = useRef(null);
  const latest = useRef(survey); latest.current = survey;
  const f = survey.facility, q = f.qhse || {};
  const updateQ = (key, value) => onFacility({ ...f, qhse: { ...q, [key]: value }, ...(key === 'projectName' ? { facilityName: value } : {}) });
  const layout = q.layout || { hidden: [], custom: [] };
  const setLayout = value => updateQ('layout', value);
  const changeInspection = (field, value) => field.custom
    ? updateQ('customValues', { ...q.customValues, [field.id]: value })
    : ['address', 'surveyorName'].includes(field.id) ? onFacility({ ...f, [field.id]: value }) : updateQ(field.id, value);
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
      if (item && photos?.length) onItem({ ...item, photos: [...(item.photos || []), ...photos] }, { persistNow: true });
      else if (!id && photos?.length) await onAdd(createPhotoEvidence(photos, latest.current.facility.address));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function choosePhotos(id, camera = false) {
    if (Capacitor.isNativePlatform()) attach(id, async () => {
      const result = await (camera ? captureFromCamera() : pickFromGallery());
      if (!result.ok && !result.cancelled) throw new Error(result.message);
      return result.ok ? (camera ? [result.photo] : result.photos) : [];
    });
    else {
      targetRef.current = id;
      if (camera) fileRef.current.setAttribute('capture', 'environment'); else fileRef.current.removeAttribute('capture');
      fileRef.current.click();
    }
  }
  return <section className="space-y-5">
    <div className="space-y-4"><div className="flex justify-between gap-3 items-center"><BackButton onClick={onBack} disabled={busy}>Project inspections</BackButton><button onClick={onBackup} className="text-xs text-slate-600 border rounded-lg px-3 py-2">Backup</button></div><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl sm:text-3xl font-bold text-[#293771]">QHSE Site Inspection</h1>{canEdit && <button disabled={busy} className="inline-flex items-center gap-2 min-h-11 rounded-xl bg-[#293771] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => choosePhotos(latest.current.items.find(i => i.customValues?.qhseEvidenceOnly)?.id || null)}><Images size={18} />Add photos & remarks</button>}</div></div>
    {error && <div role="alert" className="p-4 bg-red-50 text-red-800 rounded-lg">{error}</div>}
    <p className="text-sm text-slate-500">Drafts and photos save automatically. Use the sync indicator above to check cloud status.</p>
    <fieldset disabled={!canEdit} className="space-y-5 min-w-0">
      <div className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase font-semibold text-slate-500">Project</p><p className="font-bold text-[#293771]">{project?.name || q.projectName || f.facilityName}</p></div><button className="rounded-lg border border-[#293771] px-4 py-2 text-sm font-semibold text-[#293771]" onClick={() => setBuilding(v => !v)}>{building ? 'Done editing layout' : 'Build field template'}</button></div>
        {building && <div className="bg-slate-50 rounded-xl p-4 space-y-4">
          <h2 className="font-bold text-[#293771]">Report fields</h2><p className="text-xs text-slate-600">Uncheck fields to remove them from the form and exports. Saved values are retained if you restore a field.</p>
          {['inspection', 'finding'].map(scope => <div key={scope}><h3 className="text-sm font-semibold mb-2">{scope === 'inspection' ? 'Inspection details' : 'Each finding'}</h3><div className="flex flex-wrap gap-3">{[...(scope === 'inspection' ? INSPECTION_FIELDS : FINDING_FIELDS), ...(layout.custom || []).filter(field => field.scope === scope)].map(field => {
            const key = `${scope}:${field.id}`, hidden = (layout.hidden || []).includes(key);
            return <label key={key} className="text-sm inline-flex items-center gap-2 bg-white border rounded-lg p-2"><input type="checkbox" checked={!hidden} onChange={() => setLayout({ ...layout, hidden: hidden ? (layout.hidden || []).filter(k => k !== key) : [...(layout.hidden || []), key] })} />{field.label}</label>;
          })}</div></div>)}
          <div className="grid sm:grid-cols-4 gap-3 items-end"><Field label="New field name" value={newField.label} onChange={label => setNewField(v => ({ ...v, label }))} /><label className="text-sm">Add to<select className={control} value={newField.scope} onChange={e => setNewField(v => ({ ...v, scope: e.target.value }))}><option value="inspection">Inspection</option><option value="finding">Each finding</option></select></label><label className="text-sm">Field type<select className={control} value={newField.type} onChange={e => setNewField(v => ({ ...v, type: e.target.value }))}>{[['text','Text'],['textarea','Long text'],['date','Date'],['number','Number']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="rounded-lg bg-[#293771] text-white p-2 disabled:opacity-50" disabled={!newField.label.trim()} onClick={() => { setLayout({ ...layout, custom: [...(layout.custom || []), { ...newField, label: newField.label.trim(), id: `custom_${crypto.randomUUID()}`, custom: true }] }); setNewField(v => ({ ...v, label: '' })); }}>Add field</button></div>
          <div className="flex flex-wrap gap-3 items-end"><div className="flex-1"><Field label="Template name" value={templateName || q.templateName} onChange={setTemplateName} /></div><button disabled={!(templateName || q.templateName || '').trim()} className="border rounded-lg p-2 bg-white disabled:opacity-50" onClick={() => { updateQ('templateName', (templateName || q.templateName).trim()); setBuilding(false); }}>Save project template</button></div><p className="text-xs text-slate-500">This template is saved with this inspection and becomes available when starting another inspection in this project.</p>
        </div>}
        <div className="grid sm:grid-cols-2 gap-4">{activeFields(survey, 'inspection').map(field => <Field key={field.id} label={field.label + (field.required ? ' *' : '')} type={field.type === 'textarea' ? undefined : field.type || 'text'} multiline={field.type === 'textarea'} value={inspectionValue(survey, field)} onChange={value => changeInspection(field, value)} />)}</div>
      </div>
      <div className="bg-white border rounded-xl p-5 space-y-3"><h2 className="font-bold text-[#293771]">Photos & remarks</h2><p className="text-sm text-slate-600">Add multiple photos, including five at once. Each photo has its own remark and appears separately in PDF and Excel.</p><div className="flex flex-wrap gap-3"><button disabled={busy} className="inline-flex items-center gap-2 min-h-11 rounded-lg bg-[#293771] text-white px-4 py-2 disabled:opacity-50" onClick={() => choosePhotos(latest.current.items.find(i => i.customValues?.qhseEvidenceOnly)?.id || null)}><Images size={18} />Add photos</button><button disabled={busy} className="inline-flex items-center gap-2 min-h-11 rounded-lg border border-[#293771] text-[#293771] px-4 py-2 disabled:opacity-50" onClick={() => choosePhotos(latest.current.items.find(i => i.customValues?.qhseEvidenceOnly)?.id || null, true)}><Camera size={18} />Take photo</button></div>{busy && <p role="status" className="text-sm text-slate-500">Processing photos / report…</p>}</div>
      <div className="flex justify-between items-center"><h2 className="text-lg font-bold">Findings ({survey.items.filter(i => !i.customValues?.qhseEvidenceOnly).length})</h2><button className="bg-[#293771] text-white px-4 py-2 rounded-lg" onClick={() => onAdd(createFinding())}>Add finding</button></div>
      {survey.items.map((item, index) => {
        const data = findingData(item);
        const custom = (key, value) => onItem({ ...item, customValues: { ...item.customValues, [key]: value } });
        return <article key={item.id} className="bg-white border rounded-xl p-5 space-y-4" style={{ borderLeft: `5px solid #${riskColor(data.severity)}` }}>
          <div className="flex justify-between gap-3"><h3 className="font-bold text-[#293771]">{item.customValues?.qhseEvidenceOnly ? 'Report photos' : `Finding ${index + 1}`}</h3>{canDelete && <button className="text-red-700 text-sm" onClick={() => { if (confirm('Remove this entry and its photos?')) onDelete(item.id); }}>Remove entry</button>}</div>
          {!item.customValues?.qhseEvidenceOnly && <div className="grid sm:grid-cols-2 gap-4">
            {activeFields(survey, 'finding').map(field => {
              const value = field.custom ? item.customValues?.[field.id] : data[field.id];
              const change = v => field.custom ? custom(field.id, v) : field.id === 'location' ? onItem({ ...item, location: v }) : field.id === 'description' ? onItem({ ...item, defectDescription: v }) : custom({ type: 'qhseType', status: 'findingStatus' }[field.id] || field.id, v);
              if (['severity', 'status'].includes(field.id) && !field.custom) return <label key={field.id} className="text-sm font-semibold">{field.label}{field.required ? ' *' : ''}<select aria-label={`Finding ${index + 1} ${field.id}`} className={`${control} mt-1`} value={value} onChange={e => change(e.target.value)}><option value="">Select {field.label.toLowerCase()}</option>{(field.id === 'severity' ? SEVERITIES : ['Open', 'Closed']).map(v => <option key={v}>{v}</option>)}</select></label>;
              return <Field key={field.id} label={field.label + (field.required ? ' *' : '')} type={field.type === 'textarea' ? undefined : field.type || 'text'} multiline={field.type === 'textarea'} list={field.id === 'type' ? 'qhse-types' : undefined} value={value} onChange={change} />;
            })}
          </div>}
          <div className="flex flex-wrap gap-3">
            <button disabled={busy} className="inline-flex items-center gap-2 border rounded-lg px-4 py-2 text-sm font-semibold text-[#293771]" onClick={() => choosePhotos(item.id, true)}><Camera size={18} />Take photo</button>
            <button disabled={busy} className="inline-flex items-center gap-2 border rounded-lg px-4 py-2 text-sm font-semibold text-[#293771]" onClick={() => choosePhotos(item.id)}><Images size={18} />Add photos</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{data.photos.map((p, n) => <div key={p.id} className="border rounded-xl p-3 bg-slate-50 space-y-2">
            {p.dataUrl ? <img src={p.dataUrl} alt={`Finding ${index + 1}, photo ${n + 1}`} className="w-full h-36 object-contain" /> : <p className="text-xs">Photo available in cloud</p>}
            <Field label={`Photo ${n + 1} remark`} multiline value={p.caption} onChange={v => onItem({ ...item, photos: item.photos.map(photo => photo.id === p.id ? { ...photo, caption: v } : photo) })} />
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
