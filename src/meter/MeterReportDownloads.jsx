import { isNativeApp } from '../utils/fileSaver';
import React, { useState, useRef, useEffect } from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';
import { exportMeterReports } from './exportReports';

export default function MeterReportDownloads({ records, projectId, canExport, compact = false }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const task = useRef(null);
  useEffect(() => () => task.current?.abort(), []);
  if (!canExport) return null;
  async function download(format) {
    if (busy) return;
    task.current = new AbortController();
    setBusy(true); setError('');
    try {
      await exportMeterReports(records, projectId, format, setMessage, task.current.signal);
      setMessage(`${format === 'pdf' ? 'PDF' : 'Excel'} ${isNativeApp() ? 'saved on this device.' : 'download started.'}`);
    } catch (e) { if (e.name === 'AbortError') { setMessage('Report cancelled. Your records are unchanged.'); } else { setError(e.message); setMessage(''); } }
    finally { setBusy(false); }
  }
  return <div className={compact ? "contents" : "space-y-2"}>
    <div className={compact ? "contents" : "flex flex-wrap gap-3"}>
      <button type="button" disabled={busy || !records.length} onClick={() => download('pdf')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#293771] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileText size={17} />{compact ? 'PDF' : 'Download PDF'}</button>
      <button type="button" disabled={busy || !records.length} onClick={() => download('excel')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl ${compact ? 'bg-emerald-600' : 'bg-[#F15F22]'} px-4 py-2 text-sm font-semibold text-white disabled:opacity-50`}><FileSpreadsheet size={17} />{compact ? 'Excel' : 'Download Excel'}</button>
    </div>
    {busy && <button type="button" onClick={() => task.current?.abort()} className="col-span-full min-h-11 text-sm font-semibold text-ocs-600">Cancel report</button>}
    {message && <p role="status" className="col-span-full text-xs text-slate-600">{message}</p>}
    {error && <p role="alert" className="col-span-full text-sm text-red-700">{error}</p>}
  </div>;
}
