import React from 'react';
import { moduleLabels } from '../utils/modules';
import { Building2, CheckCircle2, Clock, ClipboardList, Camera, MapPin, Briefcase, FileText } from 'lucide-react';

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

  // Each tile narrows the list underneath it to whatever the number counts, so
  // "9 in progress" answers "which nine?" in one tap.
  const tiles = [
    { key: 'all', label: `Total ${cap(L.records)}`, value: total, icon: Building2, tile: 'bg-indigo-50 text-indigo-600', hint: `Show every ${L.record}` },
    { key: 'submitted', label: 'Submitted', value: submitted, icon: CheckCircle2, tile: 'bg-emerald-50 text-emerald-600', hint: `Show only submitted ${L.records}` },
    { key: 'draft', label: 'In Progress', value: inProgress, icon: Clock, tile: 'bg-amber-50 text-amber-600', hint: `Show only ${L.records} still in progress` },
    { key: 'snags', label: `Total ${L.items}`, value: snags, icon: ClipboardList, tile: 'bg-sky-50 text-sky-600', hint: `Sort by most ${L.items.toLowerCase()}` },
    { key: 'photos', label: 'Photos Attached', value: photos, icon: Camera, tile: 'bg-violet-50 text-violet-600', hint: 'Sort by most photos' }
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
      <div className="relative">
        {/* Skyline drawn rather than shipped as a bitmap, matching the sidebar:
            stays sharp at any width and adds no asset to the bundle. */}
        <div className="absolute inset-y-0 right-0 w-1/2 pointer-events-none hidden md:block">
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-sky-50/60 z-10" />
          <svg
            viewBox="0 0 420 150"
            className="absolute bottom-0 right-0 w-full h-full"
            preserveAspectRatio="xMaxYMax meet"
            aria-hidden="true"
          >
            <g fill="none" stroke="rgba(40, 65, 124, 0.20)" strokeWidth="1.1" strokeLinejoin="round">
              <path d="M10 150V96h20v54M14 102h12M14 110h12M14 118h12M14 126h12M14 134h12M14 142h12" />
              <path d="M34 150V78h22v72M39 85h12M39 94h12M39 103h12M39 112h12M39 121h12M39 130h12M39 139h12" />
              <path d="M60 150V62h8V50h11v12h8v88M66 70h16M66 80h16M66 90h16M66 100h16M66 110h16M66 120h16M66 130h16M66 140h16" />
              <path d="M92 150V44l9-15 9 15v106M96 54h12M96 66h12M96 78h12M96 90h12M96 102h12M96 114h12M96 126h12M96 138h12" />
              <path d="M118 150V30c0-8 5-13 10-13s10 5 10 13v120M122 42h14M122 54h14M122 66h14M122 78h14M122 90h14M122 102h14M122 114h14M122 126h14M122 138h14" />
              <path d="M128 17V6" />
              <path d="M146 150V58h14v92M149 66h8M149 76h8M149 86h8M149 96h8M149 106h8M149 116h8M149 126h8M149 136h8" />
              <path d="M164 150V72h13v78M167 80h7M167 90h7M167 100h7M167 110h7M167 120h7M167 130h7M167 140h7" />
              <path d="M181 150V52c0-7 4-11 9-11s9 4 9 11v98M185 64h11M185 76h11M185 88h11M185 100h11M185 112h11M185 124h11M185 136h11" />
              <path d="M204 150V84h16v66M208 92h9M208 102h9M208 112h9M208 122h9M208 132h9M208 142h9" />
              <path d="M224 150V38l8-12 8 12v112M228 50h11M228 62h11M228 74h11M228 86h11M228 98h11M228 110h11M228 122h11M228 134h11" />
              <path d="M245 150V68h15v82M249 76h8M249 86h8M249 96h8M249 106h8M249 116h8M249 126h8M249 136h8" />
              <path d="M264 150V90h13v60M267 98h7M267 108h7M267 118h7M267 128h7M267 138h7" />
              <path d="M281 150V56h17v94M285 64h10M285 76h10M285 88h10M285 100h10M285 112h10M285 124h10M285 136h10" />
              <path d="M302 150V76h12v74M305 84h7M305 94h7M305 104h7M305 114h7M305 124h7M305 134h7" />
              <path d="M318 150V46c0-7 5-12 10-12s10 5 10 12v104M322 58h14M322 70h14M322 82h14M322 94h14M322 106h14M322 118h14M322 130h14M322 142h14" />
              <path d="M343 150V82h14v68M347 90h8M347 100h8M347 110h8M347 120h8M347 130h8M347 140h8" />
              <path d="M361 150V64h16v86M365 74h10M365 86h10M365 98h10M365 110h10M365 122h10M365 134h10" />
              <path d="M381 150V94h14v56M385 102h8M385 112h8M385 122h8M385 132h8M385 142h8" />
              <path d="M399 150V78h14v72M403 88h8M403 100h8M403 112h8M403 124h8M403 136h8" />
            </g>
            <path d="M0 149.5h420" stroke="rgba(40, 65, 124, 0.16)" strokeWidth="1" fill="none" />
          </svg>
        </div>

        <div className="relative z-20 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-ocs-500 to-ocs-700 text-white flex items-center justify-center shrink-0 shadow-raised">
                <Building2 className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <span className="inline-block px-2 py-0.5 rounded-md bg-ocs-50 text-ocs-600 text-[11px] font-bold tracking-wide">
                  {project.projectNumber}
                </span>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1.5 truncate">
                  {project.name}
                </h2>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-500">
                  {project.client && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5" /> {project.client}
                    </span>
                  )}
                  {project.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {project.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                    <Building2 className="w-3.5 h-3.5" />
                    {total} {total === 1 ? L.record : L.records} in this project
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0">
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
          </div>

          {/* Calm stat strip: white surfaces, colour only in the icon. Two
              compact columns on a phone (the fifth spans both), all five
              across once there is room. */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-3 mt-5">
            {tiles.map((t, i) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => onFocusList && onFocusList(t.key)}
                  title={t.hint}
                  className={`${i === tiles.length - 1 ? 'col-span-2 md:col-span-1' : ''} group text-left rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3 transition-[border-color,box-shadow,transform] duration-150 hover:border-ocs-200 hover:shadow-raised active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ocs-500`}
                >
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg ${t.tile} flex items-center justify-center shrink-0`}>
                    <Icon className="w-[18px] h-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="stat-value text-xl sm:text-2xl font-bold text-slate-900 leading-none">{t.value}</p>
                    <p className="text-[11px] sm:text-xs font-medium text-slate-500 leading-tight mt-1">{t.label}</p>
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
