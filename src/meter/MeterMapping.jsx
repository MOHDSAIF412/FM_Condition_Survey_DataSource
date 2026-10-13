import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, Images, Gauge } from 'lucide-react';
import { captureFromCamera, pickFromGallery, photosFromFiles } from '../utils/photoCapture';
import { hydratePhotos } from '../utils/cloudSync';
import { generateSurveyPDF, generateSurveyExcel } from '../utils/reportExports';
import { CanvasSignaturePad } from '../components/SignatureSection';
import BackButton from '../components/BackButton';
import ConfirmDelete from '../components/ConfirmDelete';
import ProjectHero from '../components/ProjectHero';
import { stageOf, STAGE_BY_KEY, isLocked } from '../utils/workflow';
import { formatMoney } from '../utils/currency';
import { HEADER_FIELDS, METER_FIELDS, createMeter, nextMappingNo, meterData, costTotals, headerValue, reviewChecks, blockingIssues, isDeletedMapping } from './model';
import MeterReportDownloads from './MeterReportDownloads';

const control = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
function Field({ label, value, onChange, multiline, options, ...props }) {
  if (options) return <label className="block text-sm font-semibold text-slate-700">{label}<select {...props} className={`${control} mt-1 font-normal`} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Select</option>{options.map(o => <option key={o}>{o}</option>)}</select></label>;
  const Tag = multiline ? 'textarea' : 'input';
  return <label className="block text-sm font-semibold text-slate-700">{label}<Tag {...props} className={`${control} mt-1 font-normal`} value={value ?? ''} onChange={e => onChange(e.target.value)} rows={multiline ? 3 : undefined} /></label>;
}
const money = value => value == null ? '—' : formatMoney(value);

export function MeterHub({ surveys, project, canEdit, canDelete, canExport, onBack, onCreate, onOpen, onAction, onReports }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [filter, setFilter] = useState('all');
  const listRef = useRef(null);
  const live = surveys.filter(s => !isDeletedMapping(s)), deleted = surveys.filter(isDeletedMapping);
  const shown = (showDeleted ? deleted : live).filter(s => showDeleted || !['submitted', 'draft'].includes(filter) || (filter === 'submitted' ? s.status === 'submitted' : s.status !== 'submitted'))
    .sort((a, b) => filter === 'photos' ? (b.photoCount || 0) - (a.photoCount || 0) : filter === 'snags' ? (b.itemCount ?? b.items?.length ?? 0) - (a.itemCount ?? a.items?.length ?? 0) : 0);
  async function newMapping() {
    if (busy) return;
    setBusy(true); setError('');
    try { await onCreate(project.id); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const act = async (s, action, confirmed = false) => {
    if (action === 'delete' && !confirmed) { setPendingDelete(s); return; }
    setBusy(true); setError('');
    try { if (action === 'submit') await onOpen(s.id); else await onAction(s.id, action); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="space-y-6">
    {pendingDelete && <ConfirmDelete title="Delete meter mapping?" onCancel={() => setPendingDelete(null)} onConfirm={() => { const s = pendingDelete; setPendingDelete(null); act(s, 'delete', true); }}>This removes the mapping from the project list. Its meters and photos are retained. Restore it from Deleted mappings.</ConfirmDelete>}
    <BackButton onClick={onBack}>Meter Mapping projects</BackButton>
    {project && <ProjectHero module="meter" project={project} facilities={live} onOpenReports={canExport ? onReports : undefined} onAddFacility={canEdit && !busy ? newMapping : undefined} onFocusList={key => { setShowDeleted(false); setFilter(key); listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />}
    {canEdit && project && <div className="bg-white p-5 rounded-xl border flex flex-wrap gap-4 items-center justify-between">
      <p className="text-sm text-slate-600">Start one mapping per branch, then add each tenant meter to it.</p>
      <button disabled={busy} className="bg-[#F15F22] text-white rounded-lg px-5 py-3 font-semibold disabled:opacity-50" onClick={newMapping}>New meter mapping</button>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div ref={listRef} className="scroll-mt-24 flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-bold text-[#293771]">{showDeleted ? 'Deleted mappings' : 'Project meter mappings'}</h2><div className="flex flex-wrap items-center gap-3">{!showDeleted && filter !== 'all' && <button className="text-sm font-semibold text-[#293771]" onClick={() => setFilter('all')}>Show all mappings</button>}{canDelete && <button className="min-h-11 text-sm font-semibold text-[#293771]" onClick={() => setShowDeleted(v => !v)}>{showDeleted ? 'Show mappings' : `Deleted mappings (${deleted.length})`}</button>}</div></div>
    <div className="grid sm:grid-cols-2 gap-4">{shown.map(s => <article key={s.id} className="p-5 bg-white rounded-xl border text-left shadow-sm">
      <div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-semibold text-[#F15F22]">{s.facility?.meter?.region || 'Region pending'}</span><span className={`text-xs font-semibold border rounded-md px-2 py-1 ${STAGE_BY_KEY[stageOf(s)].badge}`}>{showDeleted ? 'Deleted' : STAGE_BY_KEY[stageOf(s)].label}</span></div>
      <button disabled={showDeleted || busy} onClick={() => onOpen(s.id)} className="min-h-11 font-bold text-[#293771] mt-2 text-left">{s.facility?.meter?.branch ? `Branch ${s.facility.meter.branch}` : 'Branch pending'}</button>
      <p className="text-xs text-slate-500 mt-3">{s.itemCount ?? s.items?.length ?? 0} meters · {s.photoCount ?? s.items?.reduce((n, i) => n + (i.photos || []).length, 0) ?? 0} photos · {s.facility?.meter?.readingDate || 'Reading date pending'}</p>
      {s.submittedAt && <p className="text-xs text-slate-500 mt-2">Last submitted: {new Date(s.submittedAt).toLocaleString()}</p>}
      {!showDeleted && <div className="mt-4"><MeterReportDownloads records={[s]} projectId={project?.id} canExport={canExport} /></div>}
      <div className="flex flex-wrap gap-3 mt-3">{canEdit && !showDeleted && ['draft', 'changes_requested'].includes(stageOf(s)) && <button disabled={busy} className="min-h-11 text-sm font-semibold text-[#293771]" onClick={() => act(s, 'submit')}>Submit mapping</button>}{canDelete && !isLocked(s) && <button disabled={busy} className="min-h-11 text-sm font-semibold text-red-700" onClick={() => act(s, showDeleted ? 'restore' : 'delete')}>{showDeleted ? 'Restore mapping' : 'Delete mapping'}</button>}</div>
    </article>)}</div>
    {!shown.length && <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">{showDeleted ? 'No deleted mappings.' : live.length ? 'No mappings match this filter.' : 'Start your first meter mapping for this project.'}</div>}
  </section>;
}

export default function MeterMapping({ project, survey, canEdit, canDelete, canExport, onFacility, onItem, onAdd, onDelete, onSignatures, onBack, onBackup, onAction }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [section, setSection] = useState('details');
  const detailsRef = useRef(null), metersRef = useRef(null), reviewRef = useRef(null), signatureRef = useRef(null);
  const fileRef = useRef(null), targetRef = useRef(null);
  const latest = useRef(survey); latest.current = survey;
  const f = survey.facility, m = f.meter || {};
  const checks = reviewChecks(survey);
  const checkKey = JSON.stringify(checks);
  useEffect(() => { setAcceptWarnings(false); }, [survey.id, checkKey]);
  const blocking = checks.filter(c => c.blocking);
  const totals = costTotals(survey);

  function goToSection(key) {
    setSection(key);
    const target = { details: detailsRef, meters: metersRef, review: reviewRef }[key];
    target.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function openCheck(check) {
    goToSection(check.section);
    if (check.signature) { signatureRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' }); return; }
    const root = document.getElementById(`meter-entry-${check.itemId}`);
    const target = check.fieldId ? Array.from((root || detailsRef.current)?.querySelectorAll('[data-review-field]') || []).find(el => el.dataset.reviewField === check.fieldId) : root;
    if (target) { target.scrollIntoView({ block: 'center', behavior: 'auto' }); target.focus({ preventScroll: true }); }
  }
  const action = async (kind, confirmed = false) => {
    if (kind === 'delete' && !confirmed) { setPendingDelete(true); return; }
    if (kind === 'submit' && !confirmed) { setShowChecks(true); goToSection('review'); return; }
    setBusy(true); setError('');
    try { await onAction(survey.id, kind); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const changeHeader = (id, value) => id === 'surveyorName' ? onFacility({ ...f, surveyorName: value }) : onFacility({ ...f, meter: { ...m, [id]: value } });
  const changeMeter = (item, id, value) => onItem({ ...item, customValues: { ...item.customValues, [id]: value },
    // Mirror into the plain columns so the database rows stay readable on their own.
    ...(id === 'tenant' ? { assetName: value } : id === 'shopLocation' ? { location: value } : {}) });
  const exportReport = async format => {
    setError(''); setBusy(true);
    try {
      const issues = blockingIssues(latest.current);
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

  return <section className="inspection-form space-y-5">
    {pendingDelete && <ConfirmDelete title="Delete meter mapping?" onCancel={() => setPendingDelete(false)} onConfirm={() => { setPendingDelete(false); action('delete', true); }}>This removes the mapping from the project list. Its meters and photos are retained. Restore it from Deleted mappings.</ConfirmDelete>}
    <div className="space-y-4"><div className="flex justify-between gap-3 items-center"><BackButton onClick={onBack} disabled={busy}>Project meter mappings</BackButton><button onClick={onBackup} className="text-xs text-slate-600 border rounded-lg px-3 py-2">Backup</button></div>
      <h1 className="text-2xl sm:text-3xl font-bold text-[#293771] flex items-center gap-3"><Gauge size={28} />Meter Mapping</h1></div>
    <nav aria-label="Mapping sections" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200">
      {[['details', '1 · Details'], ['meters', '2 · Meters'], ['review', '3 · Review']].map(([key, label]) => <button type="button" key={key} aria-current={section === key ? 'location' : undefined} onClick={() => goToSection(key)} className={`min-h-12 rounded-xl px-2 py-2 text-xs sm:text-sm font-semibold ${section === key ? 'bg-white text-ocs-600 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}
    </nav>
    {error && <div role="alert" className="p-4 bg-red-50 text-red-800 rounded-lg">{error}</div>}
    <p className="text-sm text-slate-500">Drafts and photos save automatically. Use the sync indicator above to check cloud status.</p>
    <div className="rounded-xl border bg-white p-4 flex flex-wrap gap-3 justify-between items-center"><div><span className={`inline-block text-sm font-semibold rounded-lg border px-3 py-1 ${STAGE_BY_KEY[stageOf(survey)].badge}`}>{STAGE_BY_KEY[stageOf(survey)].label}</span>{survey.submittedAt && <p className="text-xs text-slate-500 mt-2">Last submitted: {new Date(survey.submittedAt).toLocaleString()}</p>}</div>{canDelete && !isLocked(survey) && <button disabled={busy} onClick={() => action('delete')} className="min-h-11 text-sm font-semibold text-red-700">Delete mapping</button>}</div>
    <fieldset disabled={!canEdit} className="space-y-5 min-w-0">
      <div ref={detailsRef} className="inspection-section bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-[#293771]">Mapping details</h2>
        <div><p className="text-xs uppercase font-semibold text-slate-500">Project</p><p className="font-bold text-[#293771]">{project?.name || f.facilityName}</p></div>
        <div className="grid sm:grid-cols-2 gap-4">{HEADER_FIELDS.map(field => <Field data-review-field={field.id} key={field.id} label={field.label + (field.required ? ' *' : '')} type={field.type === 'textarea' ? undefined : field.type || 'text'} step={field.type === 'number' ? 'any' : undefined} inputMode={field.type === 'number' ? 'decimal' : undefined} multiline={field.type === 'textarea'} value={headerValue(survey, field.id)} onChange={value => changeHeader(field.id, value)} />)}</div>
        <p className="text-xs text-slate-500">Each meter uses these defaults for hours, diversity and tariff unless you enter its own value.</p>
      </div>
      <div ref={metersRef} className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="text-lg font-bold">Meters ({survey.items.length})</h2><p className="text-sm text-slate-600">Est. total: {money(totals.monthly)} / month · {money(totals.annual)} / year</p></div><button className="bg-[#293771] text-white px-4 py-2 rounded-lg" onClick={() => onAdd(createMeter(nextMappingNo(latest.current.items)))}>Add meter</button></div>
      {survey.items.map((item, index) => {
        const data = meterData(survey, item);
        return <article id={`meter-entry-${item.id}`} key={item.id} className="bg-white border rounded-xl p-5 space-y-4" style={{ borderLeft: '5px solid #293771' }}>
          <div className="flex justify-between gap-3"><h3 className="font-bold text-[#293771]">Meter {index + 1}{data.tenant ? ` · ${data.tenant}` : ''}</h3>{canDelete && <button className="text-red-700 text-sm" onClick={() => { if (confirm('Remove this meter and its photos?')) onDelete(item.id); }}>Remove meter</button>}</div>
          <div className="grid sm:grid-cols-2 gap-4">{METER_FIELDS.map(field => {
            if (field.calculated) return <div key={field.id} className="text-sm font-semibold text-slate-700">{field.label}<p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal">{money(data[field.id])}</p></div>;
            const own = item.customValues?.[field.id];
            return <Field data-review-field={field.id} key={field.id} label={field.label + (field.required ? ' *' : '')} options={field.options}
              type={field.type === 'textarea' ? undefined : field.type || 'text'} step={field.type === 'number' ? 'any' : undefined} inputMode={field.type === 'number' ? 'decimal' : undefined} multiline={field.type === 'textarea'}
              placeholder={field.inherits && m[field.id] ? `Default ${m[field.id]}` : undefined}
              value={own ?? ''} onChange={value => changeMeter(item, field.id, value)} />;
          })}</div>
          <div><p className="text-sm font-semibold text-slate-700">Meter reference photo</p><div className="flex flex-wrap gap-3 mt-2">
            <button disabled={busy} className="inline-flex items-center gap-2 border rounded-lg px-4 py-2 text-sm font-semibold text-[#293771]" onClick={() => choosePhotos(item.id, true)}><Camera size={18} />Take photo</button>
            <button disabled={busy} className="inline-flex items-center gap-2 border rounded-lg px-4 py-2 text-sm font-semibold text-[#293771]" onClick={() => choosePhotos(item.id)}><Images size={18} />Add photos</button>
          </div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{data.photos.map((p, n) => <div key={p.id} className="border rounded-xl p-3 bg-slate-50 space-y-2">
            {p.dataUrl ? <img src={p.dataUrl} alt={`Meter ${index + 1}, photo ${n + 1}`} loading="lazy" decoding="async" className="w-full h-56 sm:h-44 object-contain rounded-lg bg-white" /> : <p className="text-xs">Photo available in cloud</p>}
            <Field label={`Photo ${n + 1} remark`} multiline value={p.caption} onChange={v => onItem({ ...item, photos: item.photos.map(photo => photo.id === p.id ? { ...photo, caption: v } : photo) })} />
            {canDelete && <button className="text-xs text-red-700 mt-2" onClick={() => { if (confirm('Remove this photo?')) onItem({ ...item, photos: item.photos.filter(photo => photo.id !== p.id), _deletedPhotoId: p.id }, { persistNow: true }); }}>Remove photo</button>}
          </div>)}</div>
        </article>;
      })}
      {busy && <p role="status" className="text-sm text-slate-500">Processing photos / report…</p>}
      <div ref={signatureRef} className="inspection-section bg-white border rounded-xl p-5 space-y-4">
        <h2 className="font-bold text-[#293771]">Surveyor sign-off</h2>
        <Field label="Surveyor name" value={survey.signatures?.surveyor?.name} onChange={v => onSignatures({ ...survey.signatures, surveyor: { ...survey.signatures.surveyor, name: v } })} />
        <Field label="Sign-off date" type="date" value={survey.signatures?.surveyor?.date} onChange={v => onSignatures({ ...survey.signatures, surveyor: { ...survey.signatures.surveyor, date: v } })} />
        <CanvasSignaturePad label="Surveyor signature" value={survey.signatures?.surveyor?.signatureData || ''} onSave={v => onSignatures({ ...survey.signatures, surveyor: { ...survey.signatures.surveyor, signatureData: v } })} />
      </div>
    </fieldset>
    <section ref={reviewRef} className="inspection-section bg-white border rounded-2xl p-5 space-y-3" aria-label="Pre-submit review">
      <h2 className="font-bold text-ocs-600">Pre-submit review</h2>
      <p className="text-sm text-slate-600">{blocking.length ? `${blocking.length} required correction(s).` : 'Required fields are complete.'} {checks.length - blocking.length} recommendation(s). Tap a check to open its section.</p>
      <button type="button" className="text-sm font-semibold text-ocs-600" onClick={() => setShowChecks(v => !v)}>{showChecks ? 'Hide checks' : 'Show checks'}</button>
      {showChecks && <ul className="space-y-2">{checks.map((check, n) => <li key={n}><button type="button" onClick={() => openCheck(check)} className={`w-full text-left rounded-xl border p-3 text-sm ${check.blocking ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>{check.blocking ? 'Required: ' : 'Recommended: '}{check.message}</button></li>)}</ul>}
      {showChecks && !blocking.length && checks.length > 0 && <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={acceptWarnings} onChange={e => setAcceptWarnings(e.target.checked)} className="mt-1" />I reviewed the recommendations and want to submit this mapping.</label>}
      {showChecks && canEdit && !isLocked(survey) && <button type="button" disabled={busy || blocking.length > 0 || (checks.length > 0 && !acceptWarnings)} onClick={() => action('submit', true)} className="min-h-11 rounded-xl bg-ocs-600 px-4 py-3 text-white font-semibold disabled:opacity-50">Confirm submission</button>}
    </section>
    <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={e => {
      const files = Array.from(e.target.files || []), id = targetRef.current; e.target.value = '';
      if (files.length) attach(id, () => photosFromFiles(files));
    }} />
    {canExport && <div className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-bold text-[#293771]">Generate meter mapping report</h2><p className="text-sm text-slate-600">PDF with every meter and its photos, or Excel in the same column order as the meter mapping sheet.</p><div className="flex gap-3 flex-wrap"><button disabled={busy} onClick={() => exportReport('pdf')} className="bg-[#293771] text-white px-5 py-3 rounded-lg disabled:opacity-50">Download PDF</button><button disabled={busy} onClick={() => exportReport('excel')} className="bg-[#F15F22] text-white px-5 py-3 rounded-lg disabled:opacity-50">Download Excel</button></div></div>}
    {canEdit && !isLocked(survey) && <div className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-bold text-[#293771]">Finish mapping</h2><p className="text-sm text-slate-600">Review the meters and photos, then submit the completed mapping.</p><button disabled={busy} onClick={() => action('submit')} className="min-h-11 rounded-lg bg-[#293771] px-5 py-3 text-white font-semibold disabled:opacity-50">{stageOf(survey) === 'submitted' ? 'Submit updated mapping' : 'Submit mapping'}</button></div>}
  </section>;
}
