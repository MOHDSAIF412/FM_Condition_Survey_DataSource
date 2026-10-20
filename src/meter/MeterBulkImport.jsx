import React, { useRef, useState } from 'react';
import { Download, Upload, CheckCircle2 } from 'lucide-react';
import { saveBlob } from '../utils/fileSaver';
import { createMeterImportTemplate, readMeterImport } from './bulkImport';
import { createProjectMeterTemplate, readProjectMeterImport } from './projectImport';

export default function MeterBulkImport({ survey, project, cloudConfigured, syncState, onPreview, onImport, onBusyChange, onShowAdded }) {
  const fileRef = useRef(null), running = useRef(false), bufferRef = useRef(null), assignments = useRef({});
  const projectMode = Boolean(project);
  const [state, setState] = useState({ phase: 'idle', progress: 0 });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const busy = ['template', 'reading', 'checking', 'saving'].includes(state.phase);
  const setBusy = value => { running.current = value; onBusyChange(value); };
  async function download() {
    if (running.current) return;
    setBusy(true); setError(''); setState({ phase: 'template', progress: 0, message: 'Preparing Excel template…' });
    try {
      await saveBlob(await (projectMode ? createProjectMeterTemplate(project) : createMeterImportTemplate(survey)), 'Meter-Mapping-Import-Template.xlsx', 'Meter Mapping template');
      setState({ phase: 'idle', progress: 0, message: 'Template ready. Fill it in, then choose Upload Excel.' });
    } catch (e) { setError(`Could not save template: ${e.message}`); setState({ phase: 'error', progress: 0 }); }
    finally { setBusy(false); }
  }
  async function read(file) {
    if (!file || running.current) return;
    setPreview(null); setError('');
    const limit = projectMode ? 50 : 10;
    if (!/\.xlsx$/i.test(file.name) || file.size > limit * 1024 * 1024) {
      setError(`Choose an .xlsx workbook no larger than ${limit} MB.`); setState({ phase: 'error', progress: 0 }); return;
    }
    setBusy(true); setState({ phase: 'reading', progress: 0, message: `Reading ${file.name}…` });
    try {
      const buffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = event => { if (event.lengthComputable) setState({ phase: 'reading', progress: Math.round(event.loaded / event.total * 60), message: `Reading ${file.name}…` }); };
        reader.onerror = () => reject(new Error('Could not read the file. Please choose it again.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsArrayBuffer(file);
      });
      setState({ phase: 'checking', progress: 65, message: 'File loaded. Checking columns, values and duplicates…' });
      await new Promise(resolve => setTimeout(resolve, 0));
      bufferRef.current = buffer; assignments.current = {};
      const parsed = projectMode ? await readProjectMeterImport(buffer, project) : await readMeterImport(buffer, survey);
      if (projectMode && !parsed.errors.length && !parsed.unassigned.length) parsed.plan = await onPreview(parsed);
      setPreview(parsed);
      setState({ phase: 'preview', progress: 80, message: parsed.errors.length ? 'File checked. Correct the errors and upload again; no meters have been added.' : `${parsed.count} meters ready to add. Review the preview, then confirm.` });
    } catch (e) { setError(`Could not read template: ${e.message}`); setState({ phase: 'error', progress: 0 }); }
    finally { setBusy(false); }
  }
  async function assignProperty(key, value) {
    if (!value || running.current) return;
    setBusy(true); setError(''); assignments.current[key] = value;
    setState({ phase: 'checking', progress: 65, message: 'Assigning photo row and refreshing property preview…' });
    try {
      const parsed = await readProjectMeterImport(bufferRef.current, project, { propertyAssignments: assignments.current });
      if (!parsed.errors.length && !parsed.unassigned.length) parsed.plan = await onPreview(parsed);
      setPreview(parsed); setState({ phase: 'preview', progress: 80, message: 'Review the grouped properties and meters before confirming.' });
    } catch (e) { setError(e.message); setState({ phase: 'error', progress: 0 }); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (running.current || !preview || preview.errors.length) return;
    setBusy(true); setError(''); setState({ phase: 'saving', progress: 90, message: 'Saving imported meters on this device…' });
    try {
      const result = await onImport(preview, update => setState(previous => ({ ...previous, phase: 'saving', ...update })));
      setPreview(null);
      setState({ phase: 'done', progress: 100, ids: result.ids, cloudComplete: result.cloudComplete, pending: result.pending,
        message: projectMode ? `${result.created} properties created, ${result.reused} reused. ${result.added} meters and ${result.photosAdded} photos added; ${result.skipped} existing meters skipped. Saved on this device.` : `${result.ids.length} meters added successfully. ${result.total} meters now in this mapping. Saved on this device.` });
    } catch (e) { setError(`Import not completed: ${e.message}`); setState({ phase: 'preview', progress: 80, message: 'Resolve the issue before trying again.' }); }
    finally { setBusy(false); }
  }
  return <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3" aria-label="Bulk meter import" aria-busy={busy}>
    <div><h3 className="font-bold text-ocs-600">Bulk import properties and meters</h3><p className="text-sm text-slate-600">{projectMode ? 'Upload one workbook for this project. Each different property name creates one property containing its meters and embedded photos. Existing properties are reused.' : 'Download the template, fill one row per meter, then upload it here. Existing meters stay in place.'}</p></div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={download} className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-ocs-200 bg-white px-4 py-2 text-sm font-semibold text-ocs-600 disabled:opacity-50"><Download size={18}/>Download Excel template</button>
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-ocs-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Upload size={18}/>Upload Excel</button>
    </div>
    <input ref={fileRef} aria-label="Upload meter mapping Excel template" hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; read(file); }}/>
    {state.message && <div role="status" aria-live="polite" className={`rounded-lg p-3 text-sm ${state.phase === 'done' ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'bg-white text-slate-700'}`}>
      <p className="font-semibold">{state.phase === 'done' && <CheckCircle2 size={17} className="inline mr-2"/>}{state.message}</p>
      {state.progress > 0 && <div className="flex items-center gap-2 mt-2"><progress aria-label="Meter import progress" className="w-full h-2 accent-emerald-600" max="100" value={state.progress}/><span>{state.progress}%</span></div>}
      {state.phase === 'done' && <><p className="mt-2 font-semibold">{!cloudConfigured ? 'Device storage only — cloud sync is not configured.' : (projectMode ? state.cloudComplete : syncState === 'synced') ? 'Cloud upload complete, including imported photos.' : state.pending || 'Cloud upload pending. Your import is saved on this device. Open Sync status to retry.'}</p><button type="button" className="min-h-11 mt-2 underline font-bold" onClick={() => onShowAdded(state.ids)}>{projectMode ? 'View properties' : 'View added meters'}</button></>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-800 bg-red-50 rounded-lg p-3">{error}</p>}
    {preview && <div className="space-y-3">
      {projectMode ? <p className="text-sm font-semibold">{preview.groups.length} properties · {preview.count} meter rows · {preview.photoCount} embedded photos · {preview.skipped} empty placeholders skipped</p> : <p className="text-sm font-semibold">Property name: {preview.header.branch || 'Missing'} · Region: {preview.header.region || 'Missing'} · {preview.count} meter rows</p>}
      {projectMode && preview.unassigned.map(row => <label key={row.key} className="block rounded-lg bg-amber-50 p-3 text-sm">{row.sheet} row {row.row}: {row.photos} photo(s) without a property. Choose its property:<select disabled={busy} className="block mt-2 rounded-lg border p-2 w-full" value="" onChange={event => assignProperty(row.key, event.target.value)}><option value="">Select property…</option>{preview.groups.map(group => <option key={group.key} value={group.name}>{group.name}</option>)}<option value="__skip__">Exclude this unnamed row</option></select></label>)}
      {projectMode && preview.warnings.length > 0 && <details className="text-sm rounded-lg bg-amber-50 p-3"><summary>{preview.warnings.length} review notes — incomplete data stays in draft; source values are retained</summary><ul className="list-disc pl-5 max-h-48 overflow-auto">{preview.warnings.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
      {preview.errors.length > 0 ? <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-800 text-sm"><p className="font-bold">{preview.errors.length} issues found. Nothing added.</p><ul className="list-disc pl-5 max-h-48 overflow-y-auto">{preview.errors.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div> : <>
        {projectMode ? <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-sm text-left"><thead className="bg-slate-100"><tr>{['Property name', 'Action', 'Meters to add', 'Existing skipped', 'Photos to add'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{(preview.plan?.summary || preview.groups.map(g => ({ name: g.name, added: g.meters.length }))).map(row => <tr key={row.name} className="border-t"><td className="p-2">{row.name}</td><td className="p-2">{row.isNew == null ? 'Awaiting assignment' : row.isNew ? 'Create property' : 'Reuse property'}</td><td className="p-2">{row.added}</td><td className="p-2">{row.skipped || 0}</td><td className="p-2">{row.photos ?? '—'}</td></tr>)}</tbody></table></div> : <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-sm text-left"><caption className="p-2 text-left text-slate-600">Preview — first {Math.min(10, preview.count)} of {preview.count} meters</caption><thead className="bg-slate-100"><tr>{['Row', 'Tenant', 'Meter number', 'Location'].map(label => <th key={label} className="p-2 whitespace-nowrap">{label}</th>)}</tr></thead><tbody>{preview.meters.slice(0, 10).map(entry => <tr key={entry.row} className="border-t"><td className="p-2">{entry.row}</td><td className="p-2">{entry.values.tenant}</td><td className="p-2 whitespace-nowrap">{entry.values.meterNumber}</td><td className="p-2">{entry.values.shopLocation}</td></tr>)}</tbody></table></div>}
        <p className="text-xs text-slate-600">Costs are calculated automatically. Incomplete records remain drafts until reviewed.</p>
        <button type="button" disabled={busy || (projectMode && (!preview.plan || preview.unassigned.length > 0))} onClick={confirm} className="min-h-11 rounded-xl bg-emerald-700 px-5 py-2 font-bold text-white disabled:opacity-50">{projectMode ? 'Confirm project import' : `Confirm: add ${preview.count} meters`}</button>
      </>}
      <button type="button" disabled={busy} onClick={() => { setPreview(null); setState({ phase: 'idle', progress: 0 }); setError(''); }} className="min-h-11 px-4 text-sm font-semibold underline">Cancel import</button>
    </div>}
  </div>;
}
