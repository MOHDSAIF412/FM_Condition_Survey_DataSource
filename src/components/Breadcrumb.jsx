import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

/**
 * Where you are in Project > Facility > Module, and the way back up.
 *
 * Kept visible on every project-specific screen: a surveyor recording snags
 * needs to be able to see which facility they are attached to without having
 * to navigate anywhere to check.
 */
export default function Breadcrumb({ project, facility, moduleName, onHome, onProject }) {
  if (!project) return null;

  const facilityLabel = facility
    ? [facility.facilityCode, facility.facilityName || facility.buildingName]
        .filter(Boolean).join(' · ') || 'New facility'
    : null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-[12px] text-slate-600 overflow-x-auto whitespace-nowrap"
    >
      <button
        type="button"
        onClick={onHome}
        className="inline-flex items-center gap-1 font-semibold text-ocs-600 hover:text-ocs-700 shrink-0"
      >
        <Home className="w-3.5 h-3.5" />
        Projects
      </button>

      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

      <button
        type="button"
        onClick={onProject}
        className={`font-semibold shrink-0 ${
          facilityLabel ? 'text-ocs-600 hover:text-ocs-700' : 'text-slate-900'
        }`}
      >
        {project.projectNumber}
      </button>

      {facilityLabel && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className={moduleName ? 'font-semibold text-slate-700' : 'font-semibold text-slate-900'}>
            {facilityLabel}
          </span>
        </>
      )}

      {moduleName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-900">{moduleName}</span>
        </>
      )}
    </nav>
  );
}
