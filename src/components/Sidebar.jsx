import React from 'react';
import { Home, FileText, Settings } from 'lucide-react';

/**
 * Desktop-only navigation rail. Hidden below lg: the mobile survey flow
 * (bottom tab bar, single-column screens) is the well-tested, real day-to-day
 * path for a surveyor on site and stays exactly as it was -- this is purely
 * an additional way in on a wide screen, not a replacement for it.
 */
export default function Sidebar({ view, onNavigate, canOpenUsers }) {
  // Dashboard IS the project list -- there was a separate "Projects" item
  // pointing at the same screen, which is why two entries lit up for one view.
  const items = [
    { key: 'projects', label: 'Dashboard', icon: Home },
    { key: 'reports', label: 'Reports', icon: FileText },
    ...(canOpenUsers ? [{ key: 'users', label: 'Settings', icon: Settings }] : [])
  ];

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-gradient-to-b from-[#0f2557] via-ocs-800 to-[#0a1c42] text-white">
      <div className="px-6 pt-7 pb-8 border-b border-white/10">
        <img
          src="/ocs-logo-white.png"
          alt="OCS"
          className="h-10 w-auto"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <p className="text-[11px] text-sky-200/55 mt-2 tracking-wide">
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
              className={`w-full flex items-center gap-3.5 pl-6 pr-4 py-3.5 rounded-r-xl text-[16px] transition-colors ${
                isActive
                  ? 'bg-white text-ocs-700 font-bold shadow-sm'
                  : 'text-sky-100/75 font-medium hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className={`w-[22px] h-[22px] ${isActive ? 'text-ocs-600' : ''}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-6 pb-4 text-sky-200/60 text-[13px] font-medium leading-snug">
        Better Facilities<br />for a Smarter Tomorrow
      </div>

      {/* Skyline, drawn rather than shipped as a bitmap so it stays sharp at
          any sidebar width and costs no extra asset. shrink-0 matters: as a
          flex child it otherwise gets squashed to a sliver rather than keeping
          the artwork's own aspect ratio. */}
      <svg
        viewBox="0 0 220 120"
        className="w-full h-auto block shrink-0"
        aria-hidden="true"
        preserveAspectRatio="xMidYMax meet"
      >
        <g
          fill="none"
          stroke="rgba(147, 205, 255, 0.38)"
          strokeWidth="1"
          strokeLinejoin="round"
        >
          {/* left low-rise cluster */}
          <path d="M4 120V74h14v46M7 78h8M7 84h8M7 90h8M7 96h8M7 102h8M7 108h8" />
          <path d="M20 120V62h16v58M24 66h8M24 73h8M24 80h8M24 87h8M24 94h8M24 101h8M24 108h8" />
          <path d="M38 120V84h12v36M41 88h6M41 95h6M41 102h6M41 109h6" />

          {/* stepped tower */}
          <path d="M53 120V50h6V40h8v10h6v70M58 56h12M58 64h12M58 72h12M58 80h12M58 88h12M58 96h12M58 104h12M58 112h12" />

          {/* tall tapered tower with spire */}
          <path d="M78 120V34l7-12 7 12v86M81 42h8M81 52h8M81 62h8M81 72h8M81 82h8M81 92h8M81 102h8M81 112h8" />

          {/* centre flagship tower */}
          <path d="M98 120V22c0-6 4-10 8-10s8 4 8 10v98M101 32h10M101 42h10M101 52h10M101 62h10M101 72h10M101 82h10M101 92h10M101 102h10M101 112h10" />
          <path d="M106 12V4" />

          {/* twin slabs */}
          <path d="M120 120V46h10v74M122 52h6M122 60h6M122 68h6M122 76h6M122 84h6M122 92h6M122 100h6M122 108h6" />
          <path d="M132 120V56h10v64M134 62h6M134 70h6M134 78h6M134 86h6M134 94h6M134 102h6M134 110h6" />

          {/* domed tower */}
          <path d="M146 120V44c0-5 3-8 7-8s7 3 7 8v76M149 54h8M149 62h8M149 70h8M149 78h8M149 86h8M149 94h8M149 102h8M149 110h8" />

          {/* right cluster */}
          <path d="M164 120V66h13v54M167 72h7M167 80h7M167 88h7M167 96h7M167 104h7M167 112h7" />
          <path d="M179 120V54h12v66M182 60h6M182 68h6M182 76h6M182 84h6M182 92h6M182 100h6M182 108h6" />
          <path d="M193 120V78h11v42M196 84h5M196 92h5M196 100h5M196 108h5" />
          <path d="M206 120V88h10v32M208 94h6M208 102h6M208 110h6" />
        </g>

        {/* ground line */}
        <path d="M0 119.5h220" stroke="rgba(147, 205, 255, 0.28)" strokeWidth="1" fill="none" />
      </svg>
    </aside>
  );
}
