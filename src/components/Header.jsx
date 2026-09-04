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
  lastSaved 
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        
        {/* Left: Brand and App Name */}
        <div className="flex items-center space-x-3">
          {/* OCS Company Logo */}
          <div className="h-10 px-2 py-1 bg-white rounded-xl flex items-center justify-center shadow-md overflow-hidden shrink-0 border border-slate-700">
            <img 
              src="/ocs_logo.png" 
              alt="OCS Logo" 
              className="h-7 w-auto object-contain"
            />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                FM Condition Survey
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Offline Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-sm">
              {survey.facility?.facilityName || survey.facility?.buildingName || 'New Facility Assessment'}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2">
          {/* Quick Generate Report Button */}
          <button
            onClick={onOpenReport}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 active:scale-95 text-white font-semibold text-xs sm:text-sm shadow-md shadow-sky-600/30 transition-all"
          >
            <FileText className="w-4 h-4" />
            <span>Reports (PDF/Excel)</span>
          </button>

          {/* More Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1"
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
                    <p className="text-[11px] font-medium text-slate-400">Offline Status</p>
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
