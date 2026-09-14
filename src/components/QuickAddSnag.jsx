import React, { useState, useMemo } from 'react';
import { Zap, Search, ChevronDown, Repeat2, Plus } from 'lucide-react';
import { SNAG_TEMPLATES } from '../data/snagTemplates';
import { DEPARTMENTS, PRIORITY_LEVELS } from '../types/survey';

/**
 * Tap a common defect instead of typing it.
 *
 * Nothing here writes anything on its own -- it only fills in a new snag when
 * the surveyor taps one, and every field stays editable on the card
 * afterwards. The same defect usually recurs across many rooms in one
 * facility, so what has already been used here is offered first and carries
 * its department, priority, unit and cost with it; the built-in list is the
 * fallback for the first time something is recorded.
 */
export default function QuickAddSnag({ items = [], onAdd }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('ALL');

  /** Distinct defects already recorded in this facility, most recent first. */
  const usedHere = useMemo(() => {
    const seen = new Map();
    for (const item of [...items].reverse()) {
      const text = (item.defectDescription || '').trim();
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.set(text.toLowerCase(), {
        id: 'used_' + item.id,
        description: text,
        department: item.department || 'GENERAL',
        priority: item.priority || 2,
        unit: item.unit || 'Unit',
        estimatedCost: item.estimatedCost || 0
      });
      if (seen.size >= 8) break;
    }
    return [...seen.values()];
  }, [items]);

  const library = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SNAG_TEMPLATES.filter((t) => {
      if (dept !== 'ALL' && t.department !== dept) return false;
      if (!q) return true;
      return (
        t.description.toLowerCase().includes(q) ||
        (DEPARTMENTS[t.department]?.name || '').toLowerCase().includes(q)
      );
    });
  }, [query, dept]);

  const matchingUsed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return usedHere.filter((t) => {
      if (dept !== 'ALL' && t.department !== dept) return false;
      return !q || t.description.toLowerCase().includes(q);
    });
  }, [usedHere, query, dept]);

  // Only the departments actually represented, so the chip row stays short.
  const deptsShown = useMemo(() => {
    const ids = new Set(SNAG_TEMPLATES.map((t) => t.department));
    usedHere.forEach((t) => ids.add(t.department));
    return [...ids];
  }, [usedHere]);

  const Row = ({ t, repeat }) => {
    const d = DEPARTMENTS[t.department] || DEPARTMENTS.GENERAL;
    return (
      <button
        type="button"
        onClick={() => onAdd(t)}
        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-sky-50 border border-transparent hover:border-sky-200 flex items-start gap-2.5 transition-colors group"
      >
        {repeat
          ? <Repeat2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          : <Plus className="w-4 h-4 text-slate-300 group-hover:text-sky-600 shrink-0 mt-0.5" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-slate-800 font-medium leading-snug">
            {t.description}
          </span>
          <span className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${d.badge}`}>
              {d.name.split('&')[0].trim()}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORITY_LEVELS[t.priority]?.badge || ''}`}>
              P{t.priority}
            </span>
            {!!t.estimatedCost && (
              <span className="text-[10px] font-semibold text-slate-400">carries its cost</span>
            )}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-flame-500 text-white flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4" />
          </span>
          <span className="text-left min-w-0">
            <span className="block text-sm font-bold text-slate-800">Quick Add Snag</span>
            <span className="block text-[11px] text-slate-500 truncate">
              Tap a common defect instead of typing it
            </span>
          </span>
        </span>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search defects…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              type="button"
              onClick={() => setDept('ALL')}
              className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0 ${
                dept === 'ALL' ? 'bg-ocs-600 text-white border-ocs-600' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              All
            </button>
            {deptsShown.map((id) => {
              const d = DEPARTMENTS[id] || DEPARTMENTS.GENERAL;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDept(id)}
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0 ${
                    dept === id ? 'bg-ocs-600 text-white border-ocs-600' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {d.name.split('&')[0].trim()}
                </button>
              );
            })}
          </div>

          <div className="max-h-80 overflow-y-auto space-y-0.5 -mx-1 px-1">
            {!!matchingUsed.length && (
              <>
                <p className="text-[11px] font-bold text-slate-400 uppercase px-3 pt-1 pb-1">
                  Already used in this facility
                </p>
                {matchingUsed.map((t) => <Row key={t.id} t={t} repeat />)}
                <p className="text-[11px] font-bold text-slate-400 uppercase px-3 pt-3 pb-1">
                  Common defects
                </p>
              </>
            )}

            {library.map((t) => <Row key={t.id} t={t} />)}

            {!library.length && !matchingUsed.length && (
              <p className="text-sm text-slate-400 text-center py-6">
                Nothing matches that. Add the snag manually and it will be offered here next time.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
