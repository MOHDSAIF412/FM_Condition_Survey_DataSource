import React from 'react';
import { Home, Briefcase, Building2, FileBarChart, Settings } from 'lucide-react';

/**
 * Desktop-only navigation rail. Hidden below lg: the mobile survey flow
 * (bottom tab bar, single-column screens) is the well-tested, real day-to-day
 * path for a surveyor on site and stays exactly as it was -- this is purely
 * an additional way in on a wide screen, not a replacement for it.
 */
export default function Sidebar({ view, onNavigate, canOpenUsers }) {
  const items = [
    { key: 'projects', label: 'Dashboard', icon: Home },
    { key: 'projects', label: 'Projects', icon: Briefcase },
    { key: 'facilities', label: 'Facilities', icon: Building2 },
    { key: 'reports', label: 'Reports', icon: FileBarChart },
    ...(canOpenUsers ? [{ key: 'users', label: 'Settings', icon: Settings }] : [])
  ];

  // "Dashboard" and "Projects" both land on the same project list -- there is
  // one home screen in this app, not two -- so only "Dashboard" ever reads as
  // active, rather than lighting up two items for one view.
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-gradient-to-b from-ocs-800 to-slate-900 text-white">
      <div className="px-6 py-6 flex items-center gap-2">
        <img
          src="/ocs-logo-white.png"
          alt="OCS"
          className="h-8"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {items.map((item, idx) => {
          const isActive = item.label === 'Dashboard'
            ? view === 'projects'
            : item.label !== 'Projects' && item.key === view;

          const Icon = item.icon;
          return (
            <button
              key={item.label + idx}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-white text-ocs-800 shadow-sm'
                  : 'text-sky-100/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-6 py-6 text-sky-200/60 text-xs font-medium leading-snug border-t border-white/10">
        Better Facilities<br />for a Smarter Tomorrow
      </div>
    </aside>
  );
}
