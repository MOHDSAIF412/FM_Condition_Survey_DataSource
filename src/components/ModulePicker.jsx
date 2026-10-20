import React from 'react';
import { Building2, ShieldCheck, Gauge, ChevronRight, ArrowRight, Check, Camera, ClipboardList, BarChart3 } from 'lucide-react';

// Each module keeps its own colour through the whole card: top bar, icon tile,
// ticks, corner badge and the Select button.
const MODULES = [
  {
    id: 'condition', title: 'Condition Survey', Icon: Building2, Badge: Camera,
    description: 'Assess facilities, record defects and collect photo evidence.',
    points: ['Facility condition audits', 'Defect tracking', 'Photo documentation'],
    bar: 'bg-blue-500', tile: 'bg-blue-50 text-blue-600', tick: 'bg-blue-500', glow: 'bg-blue-50', badge: 'text-blue-600',
    button: 'bg-blue-50 text-blue-700 group-hover:bg-blue-100'
  },
  {
    id: 'qhse', title: 'QHSE Inspection', Icon: ShieldCheck, Badge: ClipboardList,
    description: 'Inspect safety, quality, health and environment. Prepare PDF and Excel reports.',
    points: ['Safety inspections', 'Compliance tracking', 'Automated reports'],
    bar: 'bg-emerald-500', tile: 'bg-emerald-50 text-emerald-600', tick: 'bg-emerald-500', glow: 'bg-emerald-50', badge: 'text-emerald-600',
    button: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100'
  },
  {
    id: 'meter', title: 'Meter Mapping', Icon: Gauge, Badge: BarChart3,
    description: 'Map tenant electricity meters by property, estimate running costs and collect meter photos.',
    points: ['Meter data mapping', 'Running cost estimation', 'Photo evidence'],
    bar: 'bg-flame-500', tile: 'bg-orange-50 text-flame-600', tick: 'bg-flame-500', glow: 'bg-orange-50', badge: 'text-flame-600',
    button: 'bg-orange-50 text-flame-600 group-hover:bg-orange-100'
  }
];

// Rows on a phone so all three fit on one screen; full cards once there is room.
export default function ModulePicker({ onSelect }) {
  return <section className="relative w-full min-w-0 space-y-6 sm:space-y-10">
    {/* Faint dashed rings and dots behind the heading, as in the design. */}
    <svg className="absolute -top-6 right-0 w-72 h-72 text-blue-200/70 pointer-events-none hidden md:block" viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="1" strokeDasharray="4 5" />
      <circle cx="170" cy="46" r="12" fill="currentColor" opacity="0.6" />
    </svg>
    <div className="relative">
      <p className="text-xs font-bold tracking-[0.2em] text-flame-500">OCS FIELD WORKSPACE</p>
      <h1 className="text-[28px] leading-tight sm:text-5xl font-extrabold tracking-tight text-ocs-700 mt-2">What would you like to work on?</h1>
      <p className="text-slate-500 mt-2 sm:mt-3 sm:text-lg">Choose a module, then select or create your project.</p>
    </div>
    <div className="relative grid md:grid-cols-3 gap-3 sm:gap-6">{MODULES.map((m) => {
      const { Icon, Badge } = m;
      return <button key={m.id} onClick={() => onSelect(m.id)} className="group relative overflow-hidden bg-white border border-slate-200/80 rounded-2xl p-4 md:p-7 md:pt-8 text-left shadow-card hover:shadow-raised hover:-translate-y-0.5 active:scale-[0.99] transition-[box-shadow,transform] duration-200 flex md:flex-col items-center md:items-start gap-4">
        <span className={`hidden md:block absolute inset-x-0 top-0 h-1 ${m.bar}`} aria-hidden="true" />
        <span className={`hidden md:block absolute -right-10 -bottom-10 w-44 h-44 rounded-full ${m.glow} opacity-80`} aria-hidden="true" />
        <span className={`relative inline-flex p-3 md:p-4 rounded-2xl ${m.tile} shrink-0`}><Icon className="w-6 h-6 md:w-8 md:h-8" /></span>
        <span className="relative flex-1 min-w-0 md:w-full">
          <span className="block text-lg md:text-2xl font-bold text-ocs-700 md:mt-2">{m.title}</span>
          <span className="block text-sm md:text-base text-slate-500 mt-1 md:mt-3 md:min-h-[4.5rem]">{m.description}</span>
          <span className="hidden md:block mt-5 pt-5 border-t border-slate-200">
            {m.points.map((p) => <span key={p} className="flex items-center gap-3 text-slate-700 py-1.5">
              <span className={`w-5 h-5 rounded-full ${m.tick} text-white inline-flex items-center justify-center shrink-0`}><Check className="w-3 h-3" strokeWidth={3} /></span>{p}
            </span>)}
          </span>
          <span className={`hidden md:inline-flex items-center gap-3 mt-6 px-6 py-3.5 rounded-xl font-bold transition-colors ${m.button}`}>Select project <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" /></span>
        </span>
        <span className={`hidden md:flex absolute right-6 bottom-24 w-14 h-14 rounded-full bg-white shadow-card items-center justify-center ${m.badge}`} aria-hidden="true"><Badge className="w-6 h-6" /></span>
        <ChevronRight className="md:hidden relative w-5 h-5 text-slate-300 shrink-0" />
      </button>;
    })}
    </div>
  </section>;
}
