import React from 'react';
import { Building, ClipboardList, BarChart3, PenTool, FileText, AlertTriangle } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab, itemsCount = 0, urgentCount = 0 }) {
  const navItems = [
    { id: 'facility', label: 'Facility Info', icon: Building },
    { id: 'items', label: 'Survey Items', icon: ClipboardList, badge: itemsCount },
    { id: 'analytics', label: 'Score & CapEx', icon: BarChart3, alertBadge: urgentCount > 0 ? urgentCount : null },
    { id: 'signatures', label: 'Sign-Off', icon: PenTool },
    { id: 'report', label: 'Report', icon: FileText, highlight: true },
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
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>

                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                    {tab.badge}
                  </span>
                )}

                {tab.alertBadge && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-rose-500 text-white flex items-center gap-0.5">
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-2 py-1 safe-area-pb">
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all relative ${
                  isActive
                    ? 'text-sky-600 font-bold'
                    : 'text-slate-500 hover:text-slate-900 font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                  
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold bg-slate-700 text-white flex items-center justify-center">
                      {tab.badge}
                    </span>
                  )}

                  {tab.alertBadge && (
                    <span className="absolute -top-1.5 -right-2.5 px-1 rounded-full text-[9px] font-bold bg-rose-500 text-white flex items-center justify-center animate-pulse">
                      !
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-1 tracking-tight truncate max-w-full">
                  {tab.label}
                </span>
                {isActive && (
                  <span className="w-5 h-0.5 bg-sky-600 rounded-full mt-0.5"></span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
