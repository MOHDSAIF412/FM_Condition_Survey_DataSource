import { useRecordPage } from '../hooks/useRecordPage';
import RecordPageFooter from '../components/RecordPageFooter';
import MobileRecordCard from '../components/MobileRecordCard';
import CloudPhoto from '../components/CloudPhoto';
import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, Images, Gauge, Plus, ChevronDown, Search, FolderOpen, Trash2 } from 'lucide-react';
import { captureFromCamera, pickFromGallery, photosFromFiles } from '../utils/photoCapture';
import { hydratePhotos } from '../utils/cloudSync';
import { generateSurveyPDF, generateSurveyExcel } from '../utils/reportExports';
import { CanvasSignaturePad } from '../components/SignatureSection';
import BackButton from '../components/BackButton';
import ConfirmDelete from '../components/ConfirmDelete';
import ProjectHero from '../components/ProjectHero';
import { stageOf, STAGE_BY_KEY, isLocked } from '../utils/workflow';
import { formatMoney } from '../utils/currency';
import { activeMeterFields, HEADER_FIELDS, METER_FIELDS, METER_GROUPS, createMeter, nextMappingNo, meterData, costTotals, headerValue, reviewChecks, blockingIssues, isDeletedMapping } from './model';
import MeterReportDownloads from './MeterReportDownloads';
import MeterBulkImport from './MeterBulkImport';
import { useSectionSpy } from '../utils/useSectionSpy';

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
  const [query, setQuery] = useState(''), [sort, setSort] = useState('newest');
  const listRef = useRef(null);
  const live = surveys.filter(s => !isDeletedMapping(s)), deleted = surveys.filter(isDeletedMapping);
  const shown = (showDeleted ? deleted : live).filter(s => showDeleted || (filter === 'submitted' ? s.status === 'submitted' : filter === 'draft' ? s.status !== 'submitted' : filter === 'photos' ? (s.photoCount || s.items?.reduce((n,i)=>n+(i.photos||[]).length,0) || 0)>0 : true))
    .filter(s => [s.id, s.facility?.meter?.branch, s.facility?.meter?.region].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'name' ? String(a.facility?.meter?.branch || '').localeCompare(String(b.facility?.meter?.branch || '')) : sort === 'meters' ? (b.itemCount ?? b.items?.length ?? 0) - (a.itemCount ?? a.items?.length ?? 0) : sort === 'oldest' ? new Date(a.updatedAt || a.submittedAt || 0) - new Date(b.updatedAt || b.submittedAt || 0) : new Date(b.updatedAt || b.submittedAt || 0) - new Date(a.updatedAt || a.submittedAt || 0));
  async function newMapping() {
    if (busy) return;
    setBusy(true); setError('');
    try { await onCreate(project.id); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const page = useRecordPage(shown, `${project?.id}:${showDeleted}:${filter}:${query}:${sort}`);
  const act = async (s, action, confirmed = false) => {
    if (action === 'delete' && !confirmed) { setPendingDelete(s); return; }
    setBusy(true); setError('');
    try { if (action === 'submit') await onOpen(s.id); else await onAction(s.id, action); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="space-y-6">
    {pendingDelete && <ConfirmDelete title="Delete meter mapping?" onCancel={() => setPendingDelete(null)} onConfirm={() => { const s = pendingDelete; setPendingDelete(null); act(s, 'delete', true); }}>This removes the mapping from the project list. Its meters and photos are retained. Restore it from Deleted mappings.</ConfirmDelete>}
    <BackButton onClick={onBack}>Meter Mapping projects</BackButton>
    {project && <ProjectHero module="meter" project={project} facilities={live} onOpenReports={canExport ? onReports : undefined} onAddFacility={canEdit && !busy ? newMapping : undefined} onFocusList={key => { setShowDeleted(false); setFilter(key === 'snags' ? 'all' : key); setSort(key === 'snags' ? 'meters' : 'newest'); setQuery(''); listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />}
    {canEdit && project && <div className="bg-white p-5 rounded-xl border flex flex-wrap gap-4 items-center justify-between">
      <p className="text-sm text-slate-600">Start one mapping per property, then add each tenant meter to it.</p>
      <button disabled={busy} className="bg-[#F15F22] text-white rounded-lg px-5 py-3 font-semibold disabled:opacity-50" onClick={newMapping}>New meter mapping</button>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div ref={listRef} className="scroll-mt-24 flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-bold text-ocs-600">{showDeleted ? 'Deleted mappings' : 'Project meter mappings'}</h2><div className="flex flex-wrap items-center gap-3">{!showDeleted && filter !== 'all' && <button className="text-sm font-semibold text-ocs-600" onClick={() => setFilter('all')}>Show all mappings</button>}{canDelete && <button className="min-h-11 text-sm font-semibold text-ocs-600" onClick={() => setShowDeleted(v => !v)}>{showDeleted ? 'Show mappings' : `Deleted mappings (${deleted.length})`}</button>}</div></div>
    <div className="mobile-status-tabs flex gap-2 overflow-x-auto pb-1" aria-label="Mapping status">
      {[['all','All',live.length],['submitted','Submitted',live.filter(s=>s.status==='submitted').length],['draft','Draft',live.filter(s=>s.status!=='submitted').length],['photos','With photos',live.filter(s=>(s.photoCount||s.items?.reduce((n,i)=>n+(i.photos||[]).length,0)||0)>0).length]].map(([key,label,count])=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>{setShowDeleted(false);setFilter(key);}} className={`shrink-0 min-h-11 rounded-full px-4 text-xs font-bold ${filter===key?'bg-blue-600 text-white':'bg-white text-ocs-600 border border-slate-200'}`}>{label} ({count})</button>)}
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><label className="relative min-w-0"><Search size={17} className="absolute left-3 top-3.5 text-slate-400"/><input aria-label="Search meter mappings" className="w-full min-h-11 rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm" placeholder="Search property name or region…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Sort meter mappings" className="min-h-11 rounded-2xl border border-slate-200 bg-white px-2 text-xs max-w-36" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Property name</option><option value="meters">Most meters</option></select></div>
    <div className="lg:hidden mobile-record-list space-y-3">{page.rows.map(s=><MobileRecordCard key={s.id} code={s.facility?.facilityNumber ? `MAP-${String(s.facility.facilityNumber).padStart(3,'0')}` : s.id} title={s.facility?.meter?.branch ? `Property: ${s.facility.meter.branch}` : 'Property name pending'} Icon={Gauge} count={`${s.itemCount ?? s.items?.length ?? 0} meters`} badges={<span className={`text-xs font-semibold border rounded-lg px-3 py-1 ${STAGE_BY_KEY[stageOf(s)].badge}`}>{showDeleted?'Deleted':STAGE_BY_KEY[stageOf(s)].label}</span>} date={s.updatedAt || s.submittedAt ? `Updated ${new Date(s.updatedAt || s.submittedAt).toLocaleString()}` : 'Date pending'} actions={<div className="mobile-record-actions grid grid-cols-2 min-[380px]:grid-cols-4 gap-2">
      {!showDeleted&&<button type="button" disabled={busy} onClick={()=>act(s,'submit')} className="min-h-11 flex items-center justify-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm font-semibold text-ocs-600"><FolderOpen size={17}/>Open</button>}
      {!showDeleted&&<MeterReportDownloads records={[s]} projectId={project?.id} canExport={canExport} compact/>}
      {canDelete&&!isLocked(s)&&<button type="button" disabled={busy} onClick={()=>act(s,showDeleted?'restore':'delete')} className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm font-semibold"><Trash2 size={17}/>{showDeleted?'Restore':'Delete'}</button>}
    </div>} secondaryActions={!showDeleted&&canEdit&&!isLocked(s)&&<><button type="button" disabled={busy} onClick={()=>act(s,'submit')} className="text-xs font-semibold text-ocs-600">Edit mapping</button>{s.status!=='submitted'&&<button type="button" disabled={busy} onClick={()=>act(s,'submit')} className="text-xs font-semibold text-emerald-700">Submit mapping</button>}</>}><p>{s.photoCount ?? s.items?.reduce((n,i)=>n+(i.photos||[]).length,0) ?? 0} photos · {s.facility?.meter?.readingDate || 'Reading date pending'}</p></MobileRecordCard>)}</div>
    <div className="hidden lg:grid lg:grid-cols-2 gap-4">{page.rows.map(s => <article key={s.id} className="p-5 bg-white rounded-xl border text-left shadow-sm">
      <div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-semibold text-[#F15F22]">{s.facility?.meter?.region || 'Region pending'}</span><span className={`text-xs font-semibold border rounded-md px-2 py-1 ${STAGE_BY_KEY[stageOf(s)].badge}`}>{showDeleted ? 'Deleted' : STAGE_BY_KEY[stageOf(s)].label}</span></div>
      <button disabled={showDeleted || busy} onClick={() => onOpen(s.id)} className="min-h-11 font-bold text-ocs-600 mt-2 text-left">{s.facility?.meter?.branch ? `Property: ${s.facility.meter.branch}` : 'Property name pending'}</button>
      <p className="text-xs text-slate-500 mt-3">{s.itemCount ?? s.items?.length ?? 0} meters · {s.photoCount ?? s.items?.reduce((n, i) => n + (i.photos || []).length, 0) ?? 0} photos · {s.facility?.meter?.readingDate || 'Reading date pending'}</p>
      {s.submittedAt && <p className="text-xs text-slate-500 mt-2">Last submitted: {new Date(s.submittedAt).toLocaleString()}</p>}
      {!showDeleted && <div className="mt-4"><MeterReportDownloads records={[s]} projectId={project?.id} canExport={canExport} /></div>}
      <div className="flex flex-wrap gap-3 mt-3">{canEdit && !showDeleted && ['draft', 'changes_requested'].includes(stageOf(s)) && <button disabled={busy} className="min-h-11 text-sm font-semibold text-ocs-600" onClick={() => act(s, 'submit')}>Submit mapping</button>}{canDelete && !isLocked(s) && <button disabled={busy} className="min-h-11 text-sm font-semibold text-red-700" onClick={() => act(s, showDeleted ? 'restore' : 'delete')}>{showDeleted ? 'Restore mapping' : 'Delete mapping'}</button>}</div>
    </article>)}</div>
    {!shown.length && <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">{showDeleted ? 'No deleted mappings.' : live.length ? 'No mappings match this filter.' : 'Start your first meter mapping for this project.'}</div>}
    <RecordPageFooter page={page}/>
  </section>;
}

export default function MeterMapping({ project, survey, canEdit, canDelete, canExport, cloudConfigured, syncState, onFacility, onItem, onAdd, onImport, onDelete, onSignatures, onBack, onBackup, onAction }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [section, setSection] = useState('details');
  const detailsRef = useRef(null), metersRef = useRef(null), reviewRef = useRef(null), signatureRef = useRef(null);
  // Meters fold to a one-line summary so a property with dozens stays scannable.
  // A mapping with a single meter, and any meter just added, start open.
  const [open, setOpen] = useState(() => new Set(survey.items.length <= 1 ? survey.items.map(i => i.id) : []));
  const seen = useRef(new Set(survey.items.map(i => i.id)));
  useEffect(() => {
    const added = survey.items.filter(i => !seen.current.has(i.id));
    added.forEach(i => seen.current.add(i.id));
    if (added.length) setOpen(prev => new Set([...prev, ...added.slice(0, 10).map(i => i.id)]));
  }, [survey.items]);
  const toggle = id => setOpen(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  useSectionSpy({ details: detailsRef, meters: metersRef, review: reviewRef }, setSection);
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
    if (check.itemId && !open.has(check.itemId)) { setOpen(prev => new Set([...prev, check.itemId])); setTimeout(() => openCheck(check), 50); return; }
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
    <div className="flex justify-between gap-3 items-center"><BackButton onClick={onBack} disabled={busy || importBusy}>Project meter mappings</BackButton><button onClick={onBackup} className="min-h-11 text-xs font-semibold text-slate-500 hover:text-ocs-600 rounded-lg px-3">Backup</button></div>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5"><span className={`inline-block text-xs font-semibold rounded-full border px-2.5 py-0.5 ${STAGE_BY_KEY[stageOf(survey)].badge}`}>{STAGE_BY_KEY[stageOf(survey)].label}</span>{survey.submittedAt && <span className="text-xs text-slate-500">Last submitted {new Date(survey.submittedAt).toLocaleString()}</span>}</div>
      <div className="flex items-center gap-3"><span className="inline-flex p-2.5 rounded-xl bg-flame-50 text-flame-600"><Gauge size={24} /></span><div><h1 className="text-2xl sm:text-3xl font-bold text-ocs-600">Meter Mapping</h1><p className="text-sm text-slate-500">Drafts and photos save automatically.</p></div></div>
    </div>
    <nav aria-label="Mapping sections" className="sticky top-[calc(4.5rem+var(--safe-area-inset-top,env(safe-area-inset-top,0px)))] z-20 grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 before:content-[''] before:absolute before:-inset-x-2 before:-top-4 before:bottom-full before:bg-[#f4f8fd] border border-slate-200/80 shadow-card">
      {[['details', 'Details'], ['meters', 'Meters'], ['review', 'Review']].map(([key, label], n) => <button type="button" key={key} aria-current={section === key ? 'location' : undefined} onClick={() => goToSection(key)} className={`min-h-11 rounded-xl px-2 py-2 text-xs sm:text-sm font-semibold transition-colors ${section === key ? 'bg-white text-ocs-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><span className="text-slate-400 mr-1">{n + 1}</span>{label}</button>)}
    </nav>
    {error && <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl">{error}</div>}
    <fieldset disabled={!canEdit || busy || importBusy} className="space-y-5 min-w-0">
      <div ref={detailsRef} className="inspection-section bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-bold text-ocs-600">Mapping details</h2>
        <div><p className="text-xs uppercase font-semibold text-slate-500">Project</p><p className="font-bold text-ocs-600">{project?.name || f.facilityName}</p></div>
        <div className="grid sm:grid-cols-2 gap-4">{activeMeterFields(survey, 'header').map(field => <Field data-review-field={field.id} key={field.id} label={field.label + (field.required ? ' *' : '')} type={field.type === 'textarea' ? undefined : field.type || 'text'} step={field.type === 'number' ? 'any' : undefined} inputMode={field.type === 'number' ? 'decimal' : undefined} multiline={field.type === 'textarea'} value={headerValue(survey, field.id)} onChange={value => changeHeader(field.id, value)} />)}</div>
        <p className="text-xs text-slate-500">Each meter uses these defaults for hours, diversity and tariff unless you enter its own value.</p>
      </div>
      <div ref={metersRef} className="inspection-section space-y-3">
        {canEdit && <MeterBulkImport key={survey.id} survey={survey} cloudConfigured={cloudConfigured} syncState={syncState} onImport={onImport} onBusyChange={setImportBusy} onShowAdded={ids => {
          setOpen(prev => new Set([...prev, ...ids.slice(0, 10)]));
          document.getElementById(`meter-entry-${ids[0]}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }}/>}
        <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-bold text-ocs-600">Meters <span className="text-slate-400 font-semibold">{survey.items.length}</span></h2><button className="inline-flex items-center gap-2 min-h-11 bg-ocs-600 hover:bg-ocs-700 text-white px-4 py-2 rounded-xl font-semibold shadow-card transition-colors" onClick={() => onAdd(createMeter(nextMappingNo(latest.current.items)))}><Plus size={18} />Add meter</button></div>
        <div className="grid grid-cols-2 gap-2.5">{[['Est. monthly cost', totals.monthly], ['Est. annual cost', totals.annual]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200/80 bg-white px-4 py-3"><p className="stat-value text-base min-[360px]:text-lg sm:text-xl font-bold text-slate-900">{money(value)}</p><p className="text-xs text-slate-500 mt-0.5">{label}</p></div>)}</div>
      </div>
      {survey.items.map((item, index) => {
        const data = meterData(survey, item);
        const expanded = open.has(item.id);
        const fieldById = Object.fromEntries(activeMeterFields(survey, 'meter').map(f => [f.id, f]));
        return <article id={`meter-entry-${item.id}`} key={item.id} className="bg-white border rounded-xl overflow-hidden">
          <button type="button" aria-expanded={expanded} onClick={() => toggle(item.id)} className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-slate-50/70 transition-colors">
            <span className="inline-flex items-center justify-center min-w-9 h-9 px-2 rounded-xl bg-ocs-50 text-ocs-600 text-sm font-bold shrink-0">{data.mappingNo === '' ? index + 1 : data.mappingNo}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-slate-900 truncate">{data.tenant || `Meter ${index + 1}`}</span>
              <span className="block text-xs text-slate-500 truncate mt-0.5">{[data.meterNumber || 'No meter number', data.shopLocation, data.monthlyCost != null ? `${money(data.monthlyCost)}/mo` : null].filter(Boolean).join(' · ')}</span>
            </span>
            {data.meterStatus && <span className={`hidden sm:inline-block text-xs font-semibold rounded-full px-2.5 py-0.5 ${data.meterStatus === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{data.meterStatus}</span>}
            {data.photos.length > 0 && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Camera size={14} />{data.photos.length}</span>}
            <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {expanded && <div className="border-t border-slate-100 p-4 sm:p-5 space-y-6">
            {[...METER_GROUPS, ['Custom fields', activeMeterFields(survey, 'meter').filter(f => f.custom).map(f => f.id)]].map(([title, ids]) => [title, ids.filter(id => activeMeterFields(survey, 'meter').some(f => f.id === id))]).filter(([, ids]) => ids.length).map(([title, ids]) => <section key={title} className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-4">{ids.map(id => {
                const field = fieldById[id];
                const wide = field.type === 'textarea' || ['tenant', 'loadVerification', 'meterNumber', 'sldAvailable', 'acSystem'].includes(id);
                const span = wide ? 'col-span-2' : 'col-span-1';
                if (field.calculated) return <div key={id} className={`${span} text-sm font-semibold text-slate-700`}>{field.label}<p className="stat-value mt-1 rounded-xl bg-ocs-50 text-ocs-700 px-3 py-3 font-bold">{money(data[id])}</p></div>;
                const own = item.customValues?.[id];
                return <div key={id} className={span}><Field data-review-field={id} label={field.label + (field.required ? ' *' : '')} options={field.options}
                  type={field.type === 'textarea' ? undefined : field.type || 'text'} step={field.type === 'number' ? 'any' : undefined} inputMode={field.type === 'number' ? 'decimal' : undefined} multiline={field.type === 'textarea'}
                  placeholder={field.inherits && m[id] ? `Default ${m[id]}` : undefined}
                  value={own ?? ''} onChange={value => changeMeter(item, id, value)} /></div>;
              })}</div>
            </section>)}
            <section className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Meter reference photo</h4>
              <div className="grid grid-cols-2 sm:flex gap-2.5">
                <button disabled={busy || importBusy} className="inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-ocs-600 hover:bg-ocs-700 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50" onClick={() => choosePhotos(item.id, true)}><Camera size={18} />Take photo</button>
                <button disabled={busy || importBusy} className="inline-flex items-center justify-center gap-2 min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-ocs-600 hover:bg-ocs-50 transition-colors disabled:opacity-50" onClick={() => choosePhotos(item.id)}><Images size={18} />Gallery</button>
              </div>
              {data.photos.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{data.photos.map((p, n) => <div key={p.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                <CloudPhoto photo={p} alt={`Meter ${index + 1}, photo ${n + 1}`} className="w-full h-56 sm:h-44 rounded-lg bg-white" />
                <Field label={`Photo ${n + 1} remark`} multiline value={p.caption} onChange={v => onItem({ ...item, photos: item.photos.map(photo => photo.id === p.id ? { ...photo, caption: v } : photo) })} />
                {canDelete && <button className="text-xs font-semibold text-red-700" onClick={() => { if (confirm('Remove this photo?')) onItem({ ...item, photos: item.photos.filter(photo => photo.id !== p.id), _deletedPhotoId: p.id }, { persistNow: true }); }}>Remove photo</button>}
              </div>)}</div>}
            </section>
            {canDelete && <div className="pt-1 border-t border-slate-100"><button className="min-h-11 text-sm font-semibold text-red-700" onClick={() => { if (confirm('Remove this meter and its photos?')) onDelete(item.id); }}>Remove meter</button></div>}
          </div>}
        </article>;
      })}
      {busy && <p role="status" className="text-sm text-slate-500">Processing photos / report…</p>}
      <div ref={signatureRef} className="inspection-section bg-white border rounded-xl p-5 space-y-4">
        <h2 className="font-bold text-ocs-600">Surveyor sign-off</h2>
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
      {showChecks && canEdit && !isLocked(survey) && <button type="button" disabled={busy || importBusy || blocking.length > 0 || (checks.length > 0 && !acceptWarnings)} onClick={() => action('submit', true)} className="min-h-11 rounded-xl bg-ocs-600 px-4 py-3 text-white font-semibold disabled:opacity-50">Confirm submission</button>}
    </section>
    <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={e => {
      const files = Array.from(e.target.files || []), id = targetRef.current; e.target.value = '';
      if (files.length) attach(id, () => photosFromFiles(files));
    }} />
    {canExport && <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card space-y-3"><h2 className="font-bold text-ocs-600">Meter mapping report</h2><p className="text-sm text-slate-500">PDF with every meter and its photos, or Excel in the same column order as the meter mapping sheet.</p><div className="grid grid-cols-1 sm:flex gap-2.5 flex-wrap"><button disabled={busy || importBusy} onClick={() => exportReport('pdf')} className="min-h-11 rounded-xl bg-ocs-600 hover:bg-ocs-700 text-white px-5 py-2.5 font-semibold disabled:opacity-50">Download PDF</button><button disabled={busy || importBusy} onClick={() => exportReport('excel')} className="min-h-11 rounded-xl bg-flame-500 hover:bg-flame-600 text-white px-5 py-2.5 font-semibold disabled:opacity-50">Download Excel</button></div></div>}
    {canEdit && !isLocked(survey) && <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card space-y-3"><h2 className="font-bold text-ocs-600">Finish mapping</h2><p className="text-sm text-slate-500">Review the meters and photos, then submit the completed mapping.</p><button disabled={busy || importBusy} onClick={() => action('submit')} className="w-full sm:w-auto min-h-12 rounded-xl bg-flame-500 hover:bg-flame-600 px-6 py-3 text-white font-semibold shadow-card disabled:opacity-50 transition-colors">{stageOf(survey) === 'submitted' ? 'Submit updated mapping' : 'Submit mapping'}</button></div>}
    {canDelete && !isLocked(survey) && <div className="text-center"><button disabled={busy || importBusy} onClick={() => action('delete')} className="min-h-11 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 rounded-xl">Delete mapping</button></div>}
  </section>;
}
