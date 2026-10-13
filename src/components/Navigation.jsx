import React from 'react';
import { Building, ClipboardList, BarChart3, PenTool, FileText, AlertTriangle } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab, itemsCount = 0, urgentCount = 0 }) {
  const navItems = [
    { id: 'facility', label: 'Facility Info', short: 'Facility', icon: Building },
    { id: 'items', label: 'Survey Items', short: 'Snags', icon: ClipboardList, badge: itemsCount },
    { id: 'analytics', label: 'Score & CapEx', short: 'Score', icon: BarChart3, alertBadge: urgentCount > 0 ? urgentCount : null },
    { id: 'signatures', label: 'Sign-Off', short: 'Sign-off', icon: PenTool },
    { id: 'report', label: 'Report', short: 'Report', icon: FileText, highlight: true },
  ];

  return (
    <>
      {/* Desktop Navigation Tabs */}
      <div className="hidden md:block bg-white border-b border-slate-200 sticky top-16 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 flex space-x-1">
          {navItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-3.5 px-4 font-semibold text-sm border-b-2 transition-colors relative ${
                  isActive
                    ? 'border-flame-500 text-ocs-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-ocs-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>

                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[12px] font-bold bg-slate-100 text-slate-700">
                    {tab.badge}
                  </span>
                )}

                {tab.alertBadge && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[12px] font-bold bg-rose-500 text-white flex items-center gap-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {tab.alertBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Sticky Bottom Navigation */}
      {/* pt-1, not py-1: a `pb` utility sits in Tailwind's utilities layer and
          overrides .safe-area-pb from the components layer, which silently
          cancelled the safe-area padding and left the tabs under the system bar. */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_16px_rgb(20_31_58/0.06)] px-2 pt-1.5 safe-area-pb">
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[52px] py-1.5 px-1 rounded-2xl transition-colors relative ${
                  isActive
                    ? 'bg-ocs-50 text-ocs-600 font-semibold'
                    : 'text-slate-500 hover:text-slate-900 font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                  
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold bg-ocs-600 text-white flex items-center justify-center">
                      {tab.badge}
                    </span>
                  )}

                  {tab.alertBadge && (
                    <span className="absolute -top-1.5 -right-2.5 px-1 rounded-full text-[10px] font-bold bg-rose-500 text-white flex items-center justify-center animate-pulse">
                      !
                    </span>
                  )}
                </div>
                <span className="text-[11px] mt-1 truncate max-w-full">
                  {tab.short}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
