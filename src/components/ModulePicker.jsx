import React from 'react';
import { Building2, ShieldCheck, Gauge, ChevronRight } from 'lucide-react';

const MODULES = [
  ['condition', 'Condition Survey', 'Assess facilities, record defects and collect photo evidence.', Building2, 'bg-ocs-50 text-ocs-600'],
  ['qhse', 'QHSE Inspection', 'Inspect safety, quality, health and environment. Prepare PDF and Excel reports.', ShieldCheck, 'bg-emerald-50 text-emerald-600'],
  ['meter', 'Meter Mapping', 'Map tenant electricity meters by branch, estimate running costs and collect meter photos.', Gauge, 'bg-flame-50 text-flame-600']
];

// Rows on a phone so all three fit on one screen; cards side by side once
// there is room.
export default function ModulePicker({ onSelect }) {
  return <section className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
    <div>
      <p className="text-xs font-bold tracking-[0.14em] text-flame-500">OCS FIELD WORKSPACE</p>
      <h1 className="text-[28px] leading-tight sm:text-4xl font-bold text-ocs-600 mt-2">What would you like to work on?</h1>
      <p className="text-slate-500 mt-2 sm:mt-3">Choose a module, then select or create your project.</p>
    </div>
    <div className="grid md:grid-cols-3 gap-3 sm:gap-5">{MODULES.map(([id, title, description, Icon, tint]) =>
      <button key={id} onClick={() => onSelect(id)} className="group bg-white border border-slate-200/80 rounded-2xl p-4 md:p-6 text-left shadow-card hover:shadow-raised hover:border-ocs-200 active:scale-[0.99] transition-[box-shadow,border-color,transform] duration-200 flex md:flex-col items-center md:items-start gap-4">
        <span className={`inline-flex p-3 md:p-3.5 rounded-xl ${tint} shrink-0`}><Icon className="w-6 h-6 md:w-7 md:h-7" /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-lg md:text-xl font-bold text-slate-900 md:mt-3">{title}</span>
          <span className="block text-sm text-slate-500 mt-1 md:mt-2 md:min-h-[3.75rem]">{description}</span>
          <span className="hidden md:flex items-center gap-1 mt-5 text-sm font-semibold text-ocs-600 group-hover:text-flame-500 transition-colors">Select project <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></span>
        </span>
        <ChevronRight className="md:hidden w-5 h-5 text-slate-300 shrink-0" />
      </button>)}
    </div>
  </section>;
}
