import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Building2, FolderKanban, User, LayoutList, CornerDownLeft } from 'lucide-react';
import { facilityCode } from '../types/survey';
import { listUsers } from '../utils/auth';

const PAGES_ADMIN = [
  { label: 'Forms & Fields', hint: 'Survey Builder', target: { admin: 'forms' } },
  { label: 'Inspection Templates', hint: 'Survey Builder', target: { admin: 'templates' } },
  { label: 'Users', hint: 'Administration', target: { admin: 'users' } },
  { label: 'Version History', hint: 'Administration', target: { admin: 'versions' } },
  { label: 'Audit Logs', hint: 'Administration', target: { admin: 'audit' } }
];
const PAGES_ALL = [
  { label: 'Dashboard', hint: 'Home', target: { view: 'home' } },
  { label: 'All Projects', hint: 'Projects', target: { view: 'projects' } },
  { label: 'Generate Reports', hint: 'Reports', target: { view: 'reports' } }
];

const norm = (s) => String(s || '').toLowerCase();

/**
 * Finds facilities, projects, pages and (for administrators) users from the
 * header. Ctrl+K / Cmd+K focuses it; arrow keys and Enter choose a result.
 * Searches what the portal has already loaded, so it also works offline.
 */
export default function GlobalSearch({ surveys = [], projects = [], isAdmin, onOpenSurvey, onOpenProject, onNavigate }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [users, setUsers] = useState(null);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, []);

  // Users are only fetched once an administrator actually searches.
  useEffect(() => {
    if (!isAdmin || !open || users !== null) return;
    setUsers([]);
    listUsers().then((list) => setUsers(list || [])).catch(() => setUsers([]));
  }, [isAdmin, open, users]);

  const projectName = (id) => projects.find((p) => p.id === id);

  const results = useMemo(() => {
    const q = norm(query).trim();
    if (!q) return [];
    const out = [];
    for (const s of surveys) {
      const code = s.facility?.facilityCode || facilityCode(s.facility?.facilityNumber);
      const p = projectName(s.projectId);
      if ([s.facilityName, code, p?.name, p?.projectNumber].some((v) => norm(v).includes(q))) {
        out.push({
          kind: 'Facility', icon: Building2, key: `s_${s.id}`,
          label: [code, s.facilityName || 'Unnamed facility'].filter(Boolean).join(' · '),
          hint: `${p?.projectNumber || 'No project'} · ${s.status === 'submitted' ? 'Completed' : 'Draft'} · ${s.itemCount || 0} snags`,
          run: () => onOpenSurvey(s.id)
        });
      }
      if (out.length >= 8) break;
    }
    for (const p of projects) {
      if ([p.name, p.projectNumber, p.client, p.location].some((v) => norm(v).includes(q))) {
        out.push({ kind: 'Project', icon: FolderKanban, key: `p_${p.id}`, label: `${p.projectNumber} · ${p.name}`, hint: p.client || p.location || '', run: () => onOpenProject(p) });
      }
    }
    if (isAdmin) {
      for (const u of users || []) {
        if ([u.email, u.full_name, u.fullName].some((v) => norm(v).includes(q))) {
          out.push({ kind: 'User', icon: User, key: `u_${u.id}`, label: u.full_name || u.fullName || u.email, hint: `${u.email} · ${u.role}`, run: () => onNavigate({ admin: 'users' }) });
        }
      }
    }
    for (const page of [...PAGES_ALL, ...(isAdmin ? PAGES_ADMIN : [])]) {
      if (norm(page.label).includes(q)) {
        out.push({ kind: 'Page', icon: LayoutList, key: `pg_${page.label}`, label: page.label, hint: page.hint, run: () => onNavigate(page.target) });
      }
    }
    return out.slice(0, 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, surveys, projects, users, isAdmin]);

  useEffect(() => { setActive(0); }, [query]);

  const choose = (r) => {
    if (!r) return;
    r.run();
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="global-search-results"
        aria-label="Search facilities, projects, users and pages"
        placeholder={isAdmin ? 'Search surveys, projects, users…' : 'Search surveys and projects…'}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full pl-10 pr-16 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      <kbd className="hidden md:inline-block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 bg-white">
        {isMac ? '⌘ K' : 'Ctrl K'}
      </kbd>

      {open && query.trim() && (
        <div id="global-search-results" role="listbox"
          className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl z-50 max-h-96 overflow-y-auto">
          {!results.length && <p className="px-4 py-6 text-sm text-slate-500 text-center">Nothing matches “{query}”.</p>}
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <button key={r.key} type="button" role="option" aria-selected={i === active}
                onMouseEnter={() => setActive(i)} onClick={() => choose(r)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${i === active ? 'bg-sky-50' : ''}`}>
                <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{r.label}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{r.kind}{r.hint ? ` · ${r.hint}` : ''}</span>
                </span>
                {i === active && <CornerDownLeft className="w-4 h-4 text-slate-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
