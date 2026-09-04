import React from 'react';
import { 
  BarChart3, 
  AlertTriangle, 
  DollarSign, 
  CheckCircle2, 
  TrendingDown, 
  ShieldAlert,
  FileText,
  Wrench,
  Building,
  Camera,
  MapPin
} from 'lucide-react';
import { PRIORITY_LEVELS, calculateSurveyStats, DEPARTMENTS } from '../types/survey';

export default function AnalyticsView({ items = [], onOpenReport }) {
  const stats = calculateSurveyStats(items || []);

  // Group costs by department
  const departmentRows = Object.keys(DEPARTMENTS).map((dKey) => {
    const dInfo = DEPARTMENTS[dKey];
    const deptStats = stats?.departmentStats?.[dKey] || { count: 0, cost: 0 };
    return {
      id: dKey,
      name: dInfo?.name || dKey,
      badge: dInfo?.badge || 'bg-slate-100 text-slate-800 border-slate-300',
      badgeSolid: dInfo?.badgeSolid || 'bg-slate-600 text-white',
      count: deptStats.count || 0,
      cost: deptStats.cost || 0
    };
  }).filter((d) => d.count > 0 || d.cost > 0);

  // Group costs by location
  const locationRows = Object.keys(stats?.locationStats || {}).map((locName) => ({
    name: locName || 'General',
    count: stats?.locationStats?.[locName]?.count || 0,
    cost: stats?.locationStats?.[locName]?.cost || 0
  })).sort((a, b) => (b.cost || 0) - (a.cost || 0));

  // Priority 1 critical hazards
  const p1Items = (items || []).filter((i) => i && i.priority === 1);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 to-sky-950 rounded-2xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Departmental Remediation & Snagging Analytics
            </span>
            <h2 className="text-xl sm:text-2xl font-bold mt-0.5">
              Facility Condition Scorecard
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Urgency classification, evidence photo tracking, and budgetary remediation forecasting by maintenance department.
            </p>
          </div>

          <button
            onClick={onOpenReport}
            className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs sm:text-sm shadow-lg flex items-center justify-center space-x-2 shrink-0 active:scale-95 transition-all"
          >
            <FileText className="w-4 h-4" />
            <span>Generate Reports</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Assets */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase">Assets Audited</span>
          <div className="my-2">
            <span className="text-3xl font-extrabold text-slate-900">{stats.total}</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Elements cataloged</span>
        </div>

        {/* Total Photos Attached */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase">Evidence Photos</span>
          <div className="my-2 flex items-center space-x-2">
            <span className="text-3xl font-extrabold text-sky-600">{stats.totalPhotos || 0}</span>
            <Camera className="w-5 h-5 text-sky-500" />
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Attached to snags</span>
        </div>

        {/* Priority 1 Hazards */}
        <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between ${
          stats.priorityCounts[1] > 0 
            ? 'bg-rose-50 border-rose-200 text-rose-900' 
            : 'bg-white border-slate-200'
        }`}>
          <span className={`text-xs font-bold uppercase ${stats.priorityCounts[1] > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
            Urgent Hazards (P1)
          </span>
          <div className="my-2 flex items-center space-x-2">
            <span className={`text-3xl font-extrabold ${(stats?.priorityCounts?.[1] || 0) > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {stats?.priorityCounts?.[1] || 0}
            </span>
            {(stats?.priorityCounts?.[1] || 0) > 0 && <AlertTriangle className="w-5 h-5 text-rose-500 animate-bounce" />}
          </div>
          <span className="text-[11px] font-medium">
            {(stats?.priorityCounts?.[1] || 0) > 0 ? 'Statutory / Life safety' : 'No critical hazards'}
          </span>
        </div>

        {/* Remediation CapEx */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase">Remediation CapEx</span>
          <div className="my-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 truncate">
              ${(stats?.totalCost || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Estimated budget</span>
        </div>
      </div>

      {/* Priority 1 Immediate Warning Banner */}
      {p1Items.length > 0 && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-2xl shadow-sm space-y-2">
          <div className="flex items-center space-x-2 text-rose-800 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <span>CRITICAL ATTENTION REQUIRED: {p1Items.length} Urgent Priority 1 Defect(s)</span>
          </div>
          <p className="text-xs text-rose-700">
            The following assets pose an immediate life safety, structural, or statutory compliance hazard:
          </p>
          <div className="space-y-1.5 pt-1">
            {p1Items.map((item) => {
              const itemDept = DEPARTMENTS[item.department] || DEPARTMENTS.GENERAL || { name: 'FM', badge: 'bg-slate-100' };
              return (
                <div key={item.id} className="bg-white p-2.5 rounded-xl border border-rose-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">{item.assetName || 'Unnamed Asset'}</span>
                    <span className="text-slate-500 ml-2">({item.location || 'Site'})</span>
                    <span className={`ml-2 px-1.5 py-0.2 rounded text-[10px] font-bold ${itemDept.badge || 'bg-slate-100'}`}>
                      {(itemDept.name || 'FM').split('&')[0]}
                    </span>
                  </div>
                  <span className="font-bold text-rose-600">${parseFloat(item.estimatedCost || 0).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Departmental CapEx Breakdown (HVAC, Electrical, Carpentry, Painting, Civil, etc.) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Wrench className="w-4 h-4 text-sky-600" />
            Remedial CapEx by Maintenance Department / Trade
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            {departmentRows.length} active departments
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {departmentRows.map((dept) => {
            const pct = (stats?.totalCost || 0) > 0 ? Math.round(((dept.cost || 0) / stats.totalCost) * 100) : 0;
            return (
              <div key={dept.id} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${dept.badge}`}>
                    {dept.name}
                  </span>
                  <span className="text-slate-500 text-[11px]">({dept.count} {dept.count === 1 ? 'item' : 'items'})</span>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-slate-900 text-sm">
                    ${(dept.cost || 0).toLocaleString()}
                  </span>
                  <span className="text-slate-400 ml-2 text-[11px]">({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Remediation Priority Schedule & Location Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Priority Schedule */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-sky-600" />
            Remediation Priority Schedule
          </h3>

          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((pNum) => {
              const count = stats?.priorityCounts?.[pNum] || 0;
              const p = PRIORITY_LEVELS[pNum] || { label: `Priority ${pNum}`, timeframe: 'N/A' };
              const labelPart = p.label ? (p.label.split(' ')[1] || p.label) : `P${pNum}`;

              return (
                <div key={pNum} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      pNum === 1 ? 'bg-red-600 text-white' :
                      pNum === 2 ? 'bg-orange-500 text-white' :
                      pNum === 3 ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                    }`}>
                      P{pNum}
                    </span>
                    <div>
                      <span className="font-bold text-slate-800">{labelPart}</span>
                      <span className="text-slate-400 text-[10px] block">{p.timeframe}</span>
                    </div>
                  </div>
                  <span className="font-extrabold text-sm text-slate-800">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Breakdown by Location */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-4 h-4 text-sky-600" />
            Defects by Location / Room
          </h3>

          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {locationRows.length === 0 ? (
              <p className="text-xs text-slate-400">No location data recorded yet.</p>
            ) : (
              locationRows.map((loc, idx) => {
                const pct = (stats?.totalCost || 0) > 0 ? Math.round(((loc.cost || 0) / stats.totalCost) * 100) : 0;
                return (
                  <div key={idx} className="p-2 rounded-xl bg-slate-50 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{loc.name}</span>
                      <span className="text-slate-400 ml-1 text-[11px]">({loc.count} items)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-800">${(loc.cost || 0).toLocaleString()}</span>
                      <span className="text-slate-400 ml-1 text-[10px]">({pct}%)</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
