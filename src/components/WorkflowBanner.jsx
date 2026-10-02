import React from 'react';
import { STAGE_BY_KEY, ACTION_LABELS } from '../utils/workflow';

/** The open facility's review stage, the reviewer's note, and the steps allowed. */
export default function WorkflowBanner({ stage, note, approvedAt, actions = [], busy, onStep }) {
  const look = {
    changes_requested: 'bg-rose-50 border-rose-200 text-rose-800',
    submitted: 'bg-sky-50 border-sky-200 text-sky-800',
    in_review: 'bg-violet-50 border-violet-200 text-violet-800',
    approved: 'bg-emerald-50 border-emerald-200 text-emerald-800'
  }[stage] || 'bg-slate-50 border-slate-200 text-slate-700';
  const text = {
    changes_requested: `Sent back for changes${note ? `: \u201c${note}\u201d` : '.'} Fix it, then submit again.`,
    submitted: 'Submitted, waiting for review.',
    in_review: 'In review: a reviewer is checking this facility.',
    approved: `Approved${approvedAt ? ` on ${new Date(approvedAt).toLocaleDateString()}` : ''}. Locked: a Manager or Admin can reopen it.`
  }[stage];
  return (
    <div role="status" className={`rounded-xl border px-3 py-2 text-[13px] flex items-center gap-2 flex-wrap ${look}`}>
      <span className="font-bold">{STAGE_BY_KEY[stage]?.label}</span>
      <span className="flex-1 min-w-[200px]">{text}</span>
      {actions.map((a) => (
        <button key={a} type="button" disabled={!!busy} onClick={() => onStep(a)}
          className="px-3 py-1 rounded-lg bg-white/80 hover:bg-white border border-black/10 text-xs font-bold disabled:opacity-50">
          {busy === a ? '\u2026' : ACTION_LABELS[a]}
        </button>
      ))}
    </div>
  );
}
