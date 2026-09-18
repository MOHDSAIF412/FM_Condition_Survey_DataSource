import React, { useEffect, useState } from 'react';
import {
  Home, LayoutList, FileText, Users, FolderKanban, History, ScrollText, Settings,
  ChevronDown, X
} from 'lucide-react';
import { useEscapeKey } from '../utils/useEscapeKey';

export const APP_VERSION = '1.0.0';

/**
 * Web portal navigation. A fixed rail on wide screens; a slide-in drawer from
 * the header menu button on narrower ones.
 *
 * Items for modules not built yet are shown as such (never faked), so the
 * portal is honest about what it does today. Each section appears only to a
 * role holding the permission it needs (`access`) -- the database refuses the
 * actions of anyone else anyway.
 */
function buildNav({ access = {}, hasOpenProject }) {
  const soon = (label, stage) => ({ label, disabled: true, stage });
  const isAdmin = !!access.config;
  return [
    { key: 'home', label: 'Dashboard', icon: Home, target: { view: 'home' } },
    // One entry: forms, sections, fields and dropdown options are all edited on
    // the same Survey Builder page, so separate links went nowhere new.
    access.config && { key: 'builder', label: 'Survey Builder', icon: LayoutList, target: { admin: 'forms' } },
    {
      key: 'reports', label: 'Reports', icon: FileText,
      children: [
        { label: 'Generate Reports', target: { view: 'reports' } },
        ...(access.config ? [soon('Report Builder', 'Stage 4'), soon('Report Templates', 'Stage 4')] : [])
      ]
    },
    access.users && {
      key: 'users', label: 'Users', icon: Users,
      children: [
        { label: 'Users', target: { admin: 'users' } },
        { label: 'Roles & Permissions', target: { admin: 'roles' } }
      ]
    },
    {
      key: 'projects', label: 'Projects', icon: FolderKanban,
      children: [
        { label: 'All Projects', target: { view: 'projects' } },
        { label: 'All Facilities', target: { view: 'allFacilities' } },
        ...(hasOpenProject ? [
          { label: 'Facilities', target: { view: 'facilities' } },
          { label: 'Photos', target: { view: 'photos' } }
        ] : []),
        ...(access.templates ? [{ label: 'Inspection Templates', target: { admin: 'templates' } }] : []),
        ...(isAdmin ? [soon('Workflows', 'Stage 6'), soon('AI Assistant', 'Not enabled')] : [])
      ]
    },
    access.config && { key: 'versions', label: 'Version History', icon: History, target: { admin: 'versions' } },
    access.config && { key: 'audit', label: 'Audit Logs', icon: ScrollText, target: { admin: 'audit' } },
    access.admin && { key: 'settings', label: 'Settings', icon: Settings, disabled: true, stage: 'Later stage' }
  ].filter(Boolean);
}

const sameTarget = (a, b) => !!a && !!b && a.view === b.view && a.admin === b.admin;

export default function PortalSidebar({
  current, access, hasOpenProject, onNavigate, open, onClose
}) {
  const nav = buildNav({ access, hasOpenProject });
  const groupOf = (target) => nav.find((g) => g.children?.some((c) => sameTarget(c.target, target)))?.key;
  const [expanded, setExpanded] = useState(() => new Set([groupOf(current), 'reports', 'users', 'projects'].filter(Boolean)));

  // The group holding the current page opens itself.
  useEffect(() => {
    const g = groupOf(current);
    if (g) setExpanded((prev) => (prev.has(g) ? prev : new Set([...prev, g])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.view, current?.admin]);

  useEscapeKey(onClose, open);

  const go = (target) => {
    onNavigate(target);
    onClose?.();
  };

  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const content = (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#0f2557] via-ocs-800 to-[#0a1c42] text-white">
      <div className="px-5 pt-6 pb-5 border-b border-white/10 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <img src="/ocs-logo-white.png" alt="OCS" className="h-9 w-auto" onError={(e) => { e.target.style.display = 'none'; }} />
          <p className="text-[15px] font-bold mt-3 leading-tight">FM Condition Survey</p>
          <p className="text-[11px] text-sky-200/60">Facility Management</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close menu" className="lg:hidden p-1.5 rounded-lg hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          if (item.children) {
            const isOpen = expanded.has(item.key);
            const hasActive = item.children.some((c) => sameTarget(c.target, current));
            return (
              <div key={item.key}>
                <button type="button" onClick={() => toggle(item.key)} aria-expanded={isOpen}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${hasActive ? 'text-white' : 'text-sky-100/80 hover:bg-white/10 hover:text-white'}`}>
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <ul className="mt-0.5 mb-1.5 ml-[30px] space-y-0.5">
                    {item.children.map((c) => {
                      const active = !c.disabled && sameTarget(c.target, current)
                        // Several builder entries open the same page; highlight only the first.
                        && item.children.find((x) => sameTarget(x.target, current)) === c;
                      return (
                        <li key={c.label}>
                          <button type="button" disabled={c.disabled} onClick={() => go(c.target)}
                            aria-current={active ? 'page' : undefined}
                            className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] flex items-center gap-2 transition-colors ${
                              active ? 'bg-white/15 text-white font-semibold'
                                : c.disabled ? 'text-sky-100/35 cursor-not-allowed'
                                  : 'text-sky-100/70 hover:text-white hover:bg-white/10'}`}>
                            <span className="flex-1 truncate">{c.label}</span>
                            {c.disabled && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-sky-100/60 shrink-0">{c.stage}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          }
          const active = !item.disabled && sameTarget(item.target, current);
          return (
            <button key={item.key} type="button" disabled={item.disabled} onClick={() => go(item.target)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${
                active ? 'bg-flame-500 text-white shadow-lg shadow-flame-900/30'
                  : item.disabled ? 'text-sky-100/35 cursor-not-allowed'
                    : 'text-sky-100/80 hover:bg-white/10 hover:text-white'}`}>
              <Icon className="w-[18px] h-[18px] shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.disabled && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-sky-100/60">{item.stage}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-3">
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/0 px-4 py-3 flex items-center gap-3">
          <img src="/ocs-logo-white.png" alt="" aria-hidden="true" className="h-7 w-auto" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="text-[11px] leading-tight text-sky-100/75">
            <p className="font-semibold">FM Condition Survey</p>
            <p>v{APP_VERSION}</p>
          </div>
          <svg aria-hidden="true" viewBox="0 0 120 40" className="absolute -right-2 -bottom-2 w-28 h-10 opacity-40">
            <path d="M0 40 Q30 5 60 22 T120 12 V40 Z" fill="#3b5697" />
          </svg>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Fixed rather than sticky: sticky let the rail scroll up with the last
          40px of a long page, clipping the logo. The spacer keeps its width. */}
      <div aria-hidden="true" className="hidden lg:block w-64 shrink-0" />
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 z-30">{content}</aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="w-72 max-w-[85vw] h-full shadow-2xl">{content}</div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-slate-900/50" onClick={onClose} />
        </div>
      )}
    </>
  );
}
