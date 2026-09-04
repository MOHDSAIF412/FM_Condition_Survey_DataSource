import React, { useState } from 'react';
import { 
  Building2, 
  Download, 
  Upload, 
  RotateCcw, 
  FileText, 
  CheckCircle2, 
  Smartphone, 
  FileCheck,
  ChevronDown,
  Sparkles
} from 'lucide-react';

export default function Header({ 
  survey, 
  onLoadSample, 
  onReset, 
  onOpenReport, 
  onExportJSON, 
  onImportJSON,
  onExportExcel,
  lastSaved,
  syncState = 'off'
}) {
  const sync = {
    off:     { label: 'Offline Ready', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    idle:    { label: 'Cloud Sync On', cls: 'bg-white/10 text-ocs-100 border-white/20' },
    syncing: { label: 'Syncing...',    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    synced:  { label: 'Synced',        cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    offline: { label: 'Offline',       cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }[syncState] || { label: 'Offline Ready', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-ocs-800 border-b border-ocs-600/60 text-white shadow-raised">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">

        {/* Left: Brand and App Name */}
        <div className="flex items-center gap-3 min-w-0">
          {/* OCS mark, knocked out for a navy surface. The trimmed asset has no
              dead margin, so h-7 renders 28px of actual letterform rather than
              the ~19px the untrimmed file gave inside a white chip. */}
          <img
            src="/ocs-logo-white.png"
            alt="OCS"
            width={858}
            height={464}
            className="h-7 w-auto shrink-0 pr-3 mr-0.5 border-r border-white/15"
          />
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                FM Condition Survey
              </h1>
              <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${sync.cls}`}>
                {sync.label}
              </span>
            </div>
            <p className="text-xs text-ocs-200/80 truncate max-w-[200px] sm:max-w-sm">
              {survey.facility?.facilityName || survey.facility?.buildingName || 'New Facility Assessment'}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2">
          {/* Quick Generate Report Button */}
          <button
            onClick={onOpenReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-flame-500 hover:bg-flame-400 active:bg-flame-600 text-white font-semibold text-xs sm:text-sm shadow-raised transition-[background-color,transform] duration-150 ease-emphasis active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ocs-800"
          >
            <FileText className="w-4 h-4" />
            <span>Reports (PDF/Excel)</span>
          </button>

          {/* More Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1"
              title="More Actions"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
            </button>

            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-60 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 text-slate-200">
                  <div className="px-3 py-1.5 border-b border-slate-700/60 mb-1">
                    <p className="text-[12px] font-medium text-slate-400">Offline Status</p>
                    <p className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Saved to Device {lastSaved ? `(${lastSaved})` : ''}
                    </p>
                  </div>

                  <button
                    onClick={() => { setShowMenu(false); onLoadSample(); }}
                    className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-700 flex items-center space-x-2 text-sky-400 font-medium"
                  >
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span>Load Sample Commercial Survey</span>
                  </button>

                  <button
                    onClick={() => { setShowMenu(false); if (onExportExcel) onExportExcel(); }}
                    className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-700 flex items-center space-x-2 text-emerald-400 font-medium"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Download Excel Report (.xlsx)</span>
                  </button>

                  <button
                    onClick={() => { setShowMenu(false); onExportJSON(); }}
                    className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-700 flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                    <span>Backup Survey (JSON)</span>
                  </button>

                  <label className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-700 flex items-center space-x-2 cursor-pointer">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span>Restore Survey (JSON)</span>
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      onChange={(e) => { setShowMenu(false); onImportJSON(e); }} 
                    />
                  </label>

                  <div className="border-t border-slate-700/60 my-1" />

                  <button
                    onClick={() => { setShowMenu(false); onReset(); }}
                    className="w-full text-left px-3.5 py-2 text-xs hover:bg-rose-950/40 text-rose-400 flex items-center space-x-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Start Fresh / Clear Survey</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
