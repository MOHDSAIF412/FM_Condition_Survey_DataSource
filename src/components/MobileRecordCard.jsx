import React, { useState } from 'react';
import { Calendar, Copy, Check, ClipboardList } from 'lucide-react';

export default function MobileRecordCard({ code, title, Icon, count, badges, date, children, actions, secondaryActions }) {
 const [copied,setCopied]=useState(false);
 async function copy(){try{await navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),1600);}catch{setCopied(false);}}
 return <article className="mobile-record-card rounded-3xl border border-slate-200/70 bg-white p-4 shadow-card text-left">
  <div className="flex gap-3 min-w-0">
   <div className="w-12 h-14 shrink-0 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center"><Icon size={28}/></div>
   <div className="min-w-0 flex-1">
    <div className="flex items-center justify-between gap-2 flex-wrap"><div className="flex items-center gap-1 min-w-0"><span className="font-bold text-sm text-slate-900 break-all">{code}</span>{code&&<button type="button" aria-label={`Copy ${code}`} onClick={copy} className="w-9 shrink-0 min-h-11 text-ocs-600 flex items-center justify-center">{copied?<Check size={16}/>:<Copy size={16}/>}</button>}</div><span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600"><ClipboardList size={14}/>{count}</span></div>
    <h3 className="font-bold text-base text-slate-900 leading-snug break-words">{title}</h3>
    <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div>
   </div>
  </div>
  {children&&<div className="mt-3 text-xs text-slate-500 space-y-1">{children}</div>}
  {date&&<p className="mt-3 text-xs text-slate-500 flex items-start gap-2"><Calendar size={14} className="shrink-0 mt-0.5"/>{date}</p>}
  <div className="mt-4 pt-3 border-t border-slate-200/80">{actions}</div>
  {secondaryActions&&<div className="mt-2 flex flex-wrap gap-3">{secondaryActions}</div>}
 </article>;
}
