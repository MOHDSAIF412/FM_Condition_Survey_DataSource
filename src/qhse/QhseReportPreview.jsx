import React, { useEffect, useRef } from 'react';
import { reportDetails, findingDetails, photoRemark } from './model';
import { useEscapeKey } from '../utils/useEscapeKey';

export default function QhseReportPreview({ records, onClose }) {
  useEscapeKey(onClose);
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector('button')?.focus();
    const trap = e => {
      if (e.key !== 'Tab') return;
      const targets = Array.from(panel.current?.querySelectorAll('button, a[href], [tabindex="0"]') || []);
      const first = targets[0], last = targets[targets.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', trap);
    return () => { window.removeEventListener('keydown', trap); previous?.focus?.(); };
  }, []);
  return <div role="dialog" aria-modal="true" aria-label="QHSE report preview" className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-2 sm:p-6">
    <section ref={panel} className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[95dvh] flex flex-col">
      <div className="flex items-center justify-between border-b p-4 gap-3"><div><h2 className="font-bold text-ocs-600">Report preview</h2><p className="text-xs text-slate-500">Review content and photos. PDF and Excel use their own page layouts.</p></div><button type="button" onClick={onClose} className="border rounded-xl px-4 py-2">Close preview</button></div>
      <div className="overflow-auto p-4 sm:p-8 space-y-10">{records.map(record => <article key={record.id} className="space-y-5">
        <img src="/ocs-logo.png" alt="OCS" className="w-40 h-16 object-contain object-left" />
        <h3 className="text-xl font-bold text-ocs-600">{record.facility?.qhse?.auditTitle || 'QHSE Site Inspection Report'}</h3>
        <dl className="grid sm:grid-cols-2 gap-3">{reportDetails(record).map(([label,value]) => <div key={label} className="border-b pb-2"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="whitespace-pre-wrap text-sm">{String(value || '—')}</dd></div>)}</dl>
        {(record.items || []).map((item,index) => <section key={item.id} className="border rounded-xl p-4 space-y-3"><h4 className="font-bold text-ocs-600">{item.customValues?.qhseEvidenceOnly ? 'Photo evidence' : `Finding ${index + 1}`}</h4>
          {!item.customValues?.qhseEvidenceOnly && <dl className="grid sm:grid-cols-2 gap-2">{findingDetails(record,item).map(([label,value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm whitespace-pre-wrap">{String(value || '—')}</dd></div>)}</dl>}
          <div className="grid sm:grid-cols-2 gap-4">{(item.photos || []).map((photo,n) => <figure key={photo.id} className="rounded-xl border p-3"><img loading="lazy" decoding="async" src={photo.dataUrl} alt={`Photo ${n+1}`} className="w-full max-h-80 object-contain" /><figcaption className="mt-3 text-sm whitespace-pre-wrap">{photoRemark(item, photo) || 'Remark pending'}</figcaption></figure>)}</div>
        </section>)}
        <section className="border-t pt-4"><h4 className="font-semibold">Inspector sign-off</h4><p>{record.signatures?.surveyor?.name || record.facility?.surveyorName || 'Name pending'} · {record.signatures?.surveyor?.date || 'Date pending'}</p>{record.signatures?.surveyor?.signatureData ? <img src={record.signatures.surveyor.signatureData} alt="Inspector signature" className="h-24 max-w-full object-contain" /> : <p className="text-amber-700">Signature pending</p>}</section>
      </article>)}</div>
    </section>
  </div>;
}
