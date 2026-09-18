import React from 'react';
import { ChevronRight, Home, LayoutDashboard } from 'lucide-react';

/**
 * Where you are in Dashboard > Projects > Project > Facility > Module, and the
 * way back up. Every level above the current one can be clicked.
 *
 * Kept visible on every project-specific screen: a surveyor recording snags
 * needs to be able to see which facility they are attached to without having
 * to navigate anywhere to check. `onDashboard` (web portal only) adds the
 * dashboard as the first level; with it, a screen above any one project (All
 * Facilities, Reports) shows Dashboard > its own name.
 */
export default function Breadcrumb({ project, facility, moduleName, onHome, onProject, onDashboard }) {
  if (!project && !(onDashboard && moduleName)) return null;

  const facilityLabel = project && facility
    ? [facility.facilityCode, facility.facilityName || facility.buildingName]
        .filter(Boolean).join(' · ') || 'New facility'
    : null;

  const sep = <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  const link = 'font-semibold text-ocs-600 hover:text-ocs-700 shrink-0';

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-[12px] text-slate-600 overflow-x-auto whitespace-nowrap"
    >
      {onDashboard && (
        <>
          <button type="button" onClick={onDashboard} className={`inline-flex items-center gap-1 ${link}`}>
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </button>
          {sep}
        </>
      )}

      {project && (
        <>
          <button type="button" onClick={onHome} className={`inline-flex items-center gap-1 ${link}`}>
            {!onDashboard && <Home className="w-3.5 h-3.5" />}
            Projects
          </button>

          {sep}

          <button
            type="button"
            onClick={onProject}
            aria-current={!facilityLabel && !moduleName ? 'page' : undefined}
            className={`font-semibold shrink-0 ${
              facilityLabel || moduleName ? 'text-ocs-600 hover:text-ocs-700' : 'text-slate-900'
            }`}
          >
            {project.projectNumber}
          </button>
        </>
      )}

      {facilityLabel && (
        <>
          {sep}
          <span className={moduleName ? 'font-semibold text-slate-700' : 'font-semibold text-slate-900'}>
            {facilityLabel}
          </span>
        </>
      )}

      {moduleName && (
        <>
          {project && sep}
          <span aria-current="page" className="font-semibold text-slate-900">{moduleName}</span>
        </>
      )}
    </nav>
  );
}
