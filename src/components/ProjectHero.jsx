import React from 'react';
import { moduleLabels } from '../utils/modules';
import { Building2, CheckCircle2, Clock, ClipboardList, Camera, MapPin, Briefcase, FileText, ChevronRight, Layers } from 'lucide-react';
import PencilSkyline from './PencilSkyline';
import WeatherDateCard from './WeatherDateCard';

/**
 * Header of the facilities screen: which project you are in, and how it is
 * doing at a glance.
 *
 * Every number here is counted from the facilities actually loaded -- there is
 * no "Overdue" tile because nothing in this app carries a due date, and a
 * permanently-zero tile would only look like a feature that was broken.
 */
export default function ProjectHero({ project, facilities = [], onOpenReports, onAddFacility, onFocusList, module = 'condition' }) {
  const qhse = module === 'qhse';
  const L = moduleLabels(module);
  const cap = w => w[0].toUpperCase() + w.slice(1);
  const total = facilities.length;
  const submitted = facilities.filter((f) => f.status === 'submitted').length;
  const inProgress = total - submitted;
  const findingCounts = facilities.map(f => f.findingCount ?? (Array.isArray(f.items) ? f.items.filter(i => !i.customValues?.qhseEvidenceOnly).length : f.itemCount === 0 ? 0 : null));
  const snags = qhse ? (findingCounts.includes(null) ? '—' : findingCounts.reduce((n, count) => n + count, 0)) : facilities.reduce((n, f) => n + (f.itemCount || 0), 0);
  const photos = facilities.reduce((n, f) => n + (f.photoCount || 0), 0);

  const pct = (n) => (total ? `${Math.round((n / total) * 1000) / 10}%` : '0%');

  // Each tile narrows the list underneath it to whatever the number counts, so
  // "9 in progress" answers "which nine?" in one tap.
  const tiles = [
    { key: 'all', label: `Total ${cap(L.records)}`, value: total, icon: Building2, tile: 'from-indigo-400 to-indigo-600', wave: '#6366f1', sub: `All ${L.records} in this project`, hint: `Show every ${L.record}` },
    { key: 'submitted', label: 'Submitted', value: submitted, icon: CheckCircle2, tile: 'from-emerald-400 to-emerald-600', wave: '#10b981', sub: `${pct(submitted)} completion rate`, hint: `Show only submitted ${L.records}` },
    { key: 'draft', label: 'In Progress', value: inProgress, icon: Clock, tile: 'from-amber-400 to-orange-500', wave: '#f59e0b', sub: `${pct(inProgress)} currently working`, hint: `Show only ${L.records} still in progress` },
    { key: 'snags', label: `Total ${L.items}`, value: snags, icon: ClipboardList, tile: 'from-sky-400 to-blue-600', wave: '#3b82f6', sub: `Identified across ${L.records}`, hint: `Sort by most ${L.items.toLowerCase()}` },
    { key: 'photos', label: 'Photos Attached', value: photos, icon: Camera, tile: 'from-fuchsia-400 to-pink-500', wave: '#d946ef', sub: 'Project photos & evidence', hint: 'Sort by most photos' }
  ];

  return (
    <div className="rounded-3xl border border-slate-200/80 shadow-card overflow-hidden bg-gradient-to-br from-sky-100 via-sky-50 to-amber-50">
      <div className="relative">
        <div className="relative z-20 p-5 sm:p-6">
          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            {/* Colour-pencil skyline instead of a photo, kept to the header so
                the stat cards never cover it, and clear of the weather card. */}
            <div className="absolute inset-y-0 right-60 w-3/5 pointer-events-none hidden lg:block opacity-90" aria-hidden="true">
              <PencilSkyline className="absolute bottom-0 right-0 w-full h-full" />
            </div>
            <div className="relative flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-2xl bg-gradient-to-br from-ocs-500 to-ocs-700 text-white flex items-center justify-center shrink-0 shadow-raised">
                <Building2 className="w-8 h-8 sm:w-9 sm:h-9" />
              </div>
              <div className="min-w-0">
                <span className="inline-block px-2 py-0.5 rounded-md bg-ocs-100 text-ocs-600 text-[11px] font-bold tracking-wide">
                  {project.projectNumber}
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1.5 truncate">
                  {project.name}
                </h2>
                <div className="flex items-center gap-3 mt-2 flex-wrap text-xs sm:text-sm text-slate-600">
                  {project.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {project.location}
                    </span>
                  )}
                  {project.client && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5" /> {project.client}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                    <Layers className="w-3.5 h-3.5" />
                    {total} {total === 1 ? L.record : L.records} in this project
                  </span>
                </div>
              </div>
            </div>

            <div className="relative flex flex-col items-stretch sm:items-end gap-3 w-full sm:w-auto shrink-0">
              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                {onOpenReports && <button
                  type="button"
                  onClick={onOpenReports}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm inline-flex items-center justify-center gap-2 border border-slate-200 shadow-card transition-colors"
                >
                  <FileText className="w-4 h-4" /> Reports
                </button>}
                {onAddFacility && <button
                  type="button"
                  onClick={onAddFacility}
                  className="col-span-1 px-4 py-2.5 rounded-xl bg-flame-500 hover:bg-flame-600 active:scale-[0.98] text-white font-semibold text-sm shadow-card inline-flex items-center justify-center gap-2 transition-[background-color,transform] duration-150 [&:only-child]:col-span-2"
                >
                  {`+ Add ${cap(L.record)}`}
                </button>}
              </div>
              <WeatherDateCard place={project.location} />
            </div>
          </div>

          {/* Stat cards: coloured icon square, big number, a plain line on what
              it counts, and a faint wave of the same colour. The wave is
              decoration, not a plotted trend. */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-6">
            {tiles.map((t, i) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => onFocusList && onFocusList(t.key)}
                  title={t.hint}
                  className={`${i === tiles.length - 1 ? 'col-span-2 md:col-span-1' : ''} group relative overflow-hidden text-left rounded-2xl border border-slate-200 bg-white px-4 py-3.5 flex items-center gap-3.5 transition-[border-color,box-shadow,transform] duration-150 hover:border-ocs-200 hover:shadow-raised active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ocs-500`}
                >
                  <svg viewBox="0 0 120 40" className="absolute right-0 bottom-0 w-24 h-8 opacity-25 pointer-events-none" aria-hidden="true">
                    <path d="M0 32 C15 10 28 36 45 22 S75 4 90 20 S110 26 120 12 V40 H0Z" fill={t.wave} opacity="0.35" />
                    <path d="M0 32 C15 10 28 36 45 22 S75 4 90 20 S110 26 120 12" fill="none" stroke={t.wave} strokeWidth="2" />
                  </svg>
                  <ChevronRight className="absolute top-3 right-3 w-4 h-4 text-slate-300 group-hover:text-ocs-500 transition-colors" />
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${t.tile} text-white flex items-center justify-center shrink-0 shadow-card`}>
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0 relative">
                    <p className="stat-value text-2xl sm:text-3xl font-bold text-slate-900 leading-none">{t.value}</p>
                    <p className="text-xs sm:text-sm font-semibold text-slate-700 leading-tight mt-1">{t.label}</p>
                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5 truncate">{t.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
