import React from 'react';
import { Home, Folder, Building2, FileText, Settings } from 'lucide-react';

/**
 * Desktop-only navigation rail. Hidden below lg: the mobile survey flow
 * (bottom tab bar, single-column screens) is the well-tested, real day-to-day
 * path for a surveyor on site and stays exactly as it was -- this is purely
 * an additional way in on a wide screen, not a replacement for it.
 */
export default function Sidebar({ view, onNavigate, canOpenUsers }) {
  const items = [
    { key: 'projects', label: 'Dashboard', icon: Home },
    { key: 'projects', label: 'Projects', icon: Folder },
    { key: 'facilities', label: 'Facilities', icon: Building2 },
    { key: 'reports', label: 'Reports', icon: FileText },
    ...(canOpenUsers ? [{ key: 'users', label: 'Settings', icon: Settings }] : [])
  ];

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-gradient-to-b from-[#0f2557] via-ocs-800 to-[#0a1c42] text-white">
      <div className="px-6 pt-7 pb-8 border-b border-white/10">
        <img
          src="/ocs-logo-white.png"
          alt="OCS"
          className="h-9 w-auto"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <p className="text-[10px] text-sky-200/50 mt-1.5 tracking-wide">
          Your Operations Partner
        </p>
      </div>

      <nav className="flex-1 pt-5 pr-3 space-y-1.5">
        {items.map((item, idx) => {
          // "Dashboard" and "Projects" both land on the same project list --
          // there is one home screen here, not two -- so only "Dashboard"
          // ever reads as active rather than lighting up two items at once.
          const isActive = item.label === 'Dashboard'
            ? view === 'projects'
            : item.label !== 'Projects' && item.key === view;

          const Icon = item.icon;
          return (
            <button
              key={item.label + idx}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={`w-full flex items-center gap-3.5 pl-6 pr-4 py-3 rounded-r-xl text-[15px] transition-colors ${
                isActive
                  ? 'bg-white text-ocs-700 font-bold shadow-sm'
                  : 'text-sky-100/75 font-medium hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-ocs-600' : ''}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-6 py-6 text-sky-200/50 text-[12px] font-medium leading-snug">
        Better Facilities<br />for a Smarter Tomorrow
      </div>
    </aside>
  );
}
