import React, { useState } from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';
import { exportMeterReports } from './exportReports';

export default function MeterReportDownloads({ records, projectId, canExport, compact = false }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  if (!canExport) return null;
  async function download(format) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await exportMeterReports(records, projectId, format, setMessage);
      setMessage(`${format === 'pdf' ? 'PDF' : 'Excel'} report generated.`);
    } catch (e) { setError(e.message); setMessage(''); }
    finally { setBusy(false); }
  }
  return <div className={compact ? "contents" : "space-y-2"}>
    <div className={compact ? "contents" : "flex flex-wrap gap-3"}>
      <button type="button" disabled={busy || !records.length} onClick={() => download('pdf')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#293771] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileText size={17} />{compact ? 'PDF' : 'Download PDF'}</button>
      <button type="button" disabled={busy || !records.length} onClick={() => download('excel')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl ${compact ? 'bg-emerald-600' : 'bg-[#F15F22]'} px-4 py-2 text-sm font-semibold text-white disabled:opacity-50`}><FileSpreadsheet size={17} />{compact ? 'Excel' : 'Download Excel'}</button>
    </div>
    {message && <p role="status" className="col-span-full text-xs text-slate-600">{message}</p>}
    {error && <p role="alert" className="col-span-full text-sm text-red-700">{error}</p>}
  </div>;
}
