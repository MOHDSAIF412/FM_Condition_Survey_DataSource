import React from 'react';
import { Building2, ShieldCheck, ArrowRight } from 'lucide-react';

export default function ModulePicker({ onSelect }) {
  return <section className="max-w-5xl mx-auto space-y-7">
    <div><p className="text-sm font-semibold text-[#F15F22]">OCS FIELD WORKSPACE</p><h1 className="text-3xl sm:text-4xl font-bold text-[#293771] mt-2">What would you like to work on?</h1><p className="text-slate-600 mt-3">Choose a module, then select or create your project.</p></div>
    <div className="grid md:grid-cols-2 gap-5">{[
      ['condition', 'Condition Survey', 'Assess facilities, record defects and collect photo evidence.', Building2],
      ['qhse', 'QHSE Inspection', 'Inspect safety, quality, health and environment. Prepare PDF and Excel reports.', ShieldCheck]
    ].map(([id, title, description, Icon]) => <button key={id} onClick={() => onSelect(id)} className="group bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 text-left shadow-sm hover:shadow-lg hover:border-[#293771] transition-all">
      <span className="inline-flex p-4 rounded-2xl bg-blue-50 text-[#293771]"><Icon size={32} /></span><h2 className="text-2xl font-bold mt-6 text-[#293771]">{title}</h2><p className="text-slate-600 mt-3 min-h-16">{description}</p><span className="flex items-center gap-2 mt-6 font-semibold text-[#F15F22]">Select project <ArrowRight size={18} /></span>
    </button>)}</div>
  </section>;
}
