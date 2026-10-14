import { isNativeApp } from '../utils/fileSaver';
import React, { useState, useRef, useEffect } from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';
import { exportQhseReports, loadQhseReports } from './exportReports';
import QhseReportPreview from './QhseReportPreview';

export default function QhseReportDownloads({ records, projectId, canExport }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const task = useRef(null);
  useEffect(() => () => task.current?.abort(), []);
  if (!canExport) return null;
  async function download(format) {
    if (busy) return;
    task.current = new AbortController();
    setBusy(true); setError('');
    try {
      await exportQhseReports(records, projectId, format, setMessage, task.current.signal);
      setMessage(`${format === 'pdf' ? 'PDF' : 'Excel'} ${isNativeApp() ? 'saved on this device.' : 'download started.'}`);
    } catch (e) { if (e.name === 'AbortError') { setMessage('Report cancelled. Your records are unchanged.'); } else { setError(e.message); setMessage(''); } }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    {preview && <QhseReportPreview records={preview} onClose={() => setPreview(null)} />}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy || !records.length} onClick={async () => { task.current = new AbortController(); setBusy(true); setError(''); try { setPreview(await loadQhseReports(records, projectId, setMessage, task.current.signal)); setMessage(''); } catch(e) { setError(e.message); } finally { setBusy(false); } }} className="min-h-11 rounded-lg border border-ocs-200 px-4 py-2 text-sm font-semibold text-ocs-600">Preview report</button>
      <button type="button" disabled={busy || !records.length} onClick={() => download('pdf')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#293771] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileText size={17} />Download PDF</button>
      <button type="button" disabled={busy || !records.length} onClick={() => download('excel')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#F15F22] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileSpreadsheet size={17} />Download Excel</button>
    </div>
    {busy && <button type="button" onClick={() => task.current?.abort()} className="col-span-full min-h-11 text-sm font-semibold text-ocs-600">Cancel report</button>}
    {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
