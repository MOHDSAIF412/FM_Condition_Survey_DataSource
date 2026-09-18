import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Loader2, AlertCircle, Info, FolderOpen, CheckCircle2, Undo2, PlayCircle, MessageSquareWarning,
  CalendarClock, ArrowRight, Lock
} from 'lucide-react';
import { facilityCode } from '../types/survey';
import { can } from '../utils/auth';
import {
  STAGES, STAGE_BY_KEY, stageOf, isOverdue, workflowActions, ACTION_LABELS, moveFacility,
  setFacilityDueDate, setProjectDueDate, workflowBackendReady, todayISO
} from '../utils/workflow';
import { sortDate } from '../utils/surveySelection';

const card = 'bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,37,87,0.06)]';
const ACTION_ICONS = { start_review: PlayCircle, approve: CheckCircle2, request_changes: MessageSquareWarning, reopen: Undo2 };
const ACTION_STYLES = {
  start_review: 'bg-violet-600 hover:bg-violet-700 text-white',
  approve: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  request_changes: 'bg-white hover:bg-rose-50 text-rose-700 border border-rose-200',
  reopen: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
};
const VIEWS = [
  { key: 'action', label: 'Needs action', test: (s) => ['submitted', 'in_review'].includes(stageOf(s)) },
  { key: 'changes_requested', label: 'Sent back', test: (s) => stageOf(s) === 'changes_requested' },
  { key: 'approved', label: 'Approved', test: (s) => stageOf(s) === 'approved' },
  { key: 'overdue', label: 'Overdue', test: (s) => isOverdue(s) },
  { key: 'all', label: 'All', test: () => true }
];

/**
 * Review & Approval: the queue of facilities waiting for someone, the steps
 * each person may take, and the due dates that decide what is overdue.
 *
 * Every step goes through the database's fm_workflow_move(), which checks the
 * permission again -- the buttons here only reflect it.
 */
export default function ReviewApproval({ currentUser, surveys = [], projects = [], onOpenSurvey, onChanged, onOpenRoles }) {
  const [ready, setReady] = useState(true);
  const [view, setView] = useState('action');
  const [projectId, setProjectId] = useState('all');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [noteFor, setNoteFor] = useState(null);     // { id, action }
  const [note, setNote] = useState('');
  const [local, setLocal] = useState({});           // id -> review fields just set here
  const mayPlan = can(currentUser, 'manage_team') || can(currentUser, 'approve_surveys');
  const maySetFacilityDue = mayPlan || can(currentUser, 'review_surveys');
  const today = todayISO();

  useEffect(() => {
    let cancelled = false;
    workflowBackendReady().then((ok) => { if (!cancelled) setReady(ok); });
    return () => { cancelled = true; };
  }, []);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const rows = useMemo(() => surveys
    .map((s) => (local[s.id] ? { ...s, ...local[s.id] } : s))
    .filter((s) => projectId === 'all' || s.projectId === projectId), [surveys, local, projectId]);
  const counts = useMemo(() => {
    const out = Object.fromEntries(STAGES.map((st) => [st.key, 0]));
    for (const s of rows) out[stageOf(s)] += 1;
    return out;
  }, [rows]);
  const current = VIEWS.find((v) => v.key === view) || VIEWS[0];
  const visible = useMemo(() => rows.filter(current.test)
    .sort((a, b) => (a.effectiveDue || '9999') .localeCompare(b.effectiveDue || '9999') || sortDate(b) - sortDate(a)),
  [rows, current]);

  const label = (s) => {
    const code = s.facility?.facilityCode || facilityCode(s.facility?.facilityNumber);
    return [code, s.facilityName].filter(Boolean).join(' · ') || 'Unnamed facility';
  };

  const run = async (s, action, withNote = null) => {
    setBusy(`${s.id}:${action}`);
    setError('');
    setDone('');
    try {
      const fields = await moveFacility(s.id, action, withNote);
      setLocal((prev) => ({ ...prev, [s.id]: fields }));
      setNoteFor(null);
      setNote('');
      setDone(`${label(s)}: ${STAGE_BY_KEY[stageOf({ ...s, ...fields })].label.toLowerCase()}.`);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const changeDue = async (s, value) => {
    setBusy(`${s.id}:due`);
    setError('');
    try {
      await setFacilityDueDate(s.id, value);
      setLocal((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] || {}), dueDate: value || null, effectiveDue: value || projectById.get(s.projectId)?.dueDate || null } }));
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const project = projectId !== 'all' ? projectById.get(projectId) : null;
  const [projectDue, setProjectDue] = useState('');
  useEffect(() => { setProjectDue(project?.dueDate || ''); }, [project?.id, project?.dueDate]);
  const saveProjectDue = async () => {
    setBusy('project:due');
    setError('');
    try {
      await setProjectDueDate(project.id, projectDue);
      setDone(`${project.projectNumber} is due ${projectDue || 'with no date'}.`);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const reviewers = can(currentUser, 'review_surveys');

  return (
    <div className="w-full space-y-4 pb-8">
      <section className="rounded-2xl bg-gradient-to-r from-ocs-800 to-slate-900 text-white px-5 sm:px-7 py-5 flex items-start gap-4 flex-wrap">
        <ClipboardCheck className="w-7 h-7 text-sky-300 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-xl font-bold">Review &amp; Approval</h1>
          <p className="text-sky-100/80 text-sm mt-0.5 max-w-3xl">
            Submitted facilities are reviewed, then approved — or sent back to the surveyor with a note.
            Approved facilities are locked until someone with Approve reopens them.
          </p>
        </div>
        {onOpenRoles && (
          <button type="button" onClick={onOpenRoles}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-sm font-bold">
            Who can review &amp; approve
          </button>
        )}
      </section>

      {!ready && (
        <div role="status" className="flex items-start gap-2 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <Info className="w-5 h-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold">Review &amp; approval is built but not switched on yet.</p>
            <p className="text-xs mt-0.5">The database update that records reviews has not been applied, so no step can be taken yet.
              Facilities show as Draft or Submitted meanwhile, exactly as before.</p>
          </div>
        </div>
      )}

      {/* The pipeline: each stage's count opens that stage below. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAGES.map((st, i) => (
          <button key={st.key} type="button"
            onClick={() => setView(st.key === 'submitted' || st.key === 'in_review' ? 'action' : st.key === 'draft' ? 'all' : st.key)}
            className={`${card} p-4 text-left hover:shadow-md transition-shadow relative`}>
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: st.color }} /> {st.label}
            </span>
            <span className="block text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">{counts[st.key]}</span>
            {i < STAGES.length - 1 && <ArrowRight className="hidden xl:block absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 z-10" />}
          </button>
        ))}
        <button type="button" onClick={() => setView('overdue')} className={`${card} p-4 text-left hover:shadow-md transition-shadow border-rose-200`}>
          <span className="text-[11px] font-bold uppercase tracking-wide text-rose-600 flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" /> Overdue
          </span>
          <span className="block text-2xl font-extrabold text-rose-700 mt-1 tabular-nums">{rows.filter((s) => isOverdue(s, today)).length}</span>
        </button>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap" role="tablist">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${view === v.key ? 'bg-ocs-600 text-white border-ocs-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {v.label} <span className={view === v.key ? 'text-sky-200' : 'text-slate-400'}>({rows.filter(v.test).length})</span>
              </button>
            ))}
          </div>
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-500 font-semibold">
            Project:
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="max-w-[240px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 bg-white">
              <option value="all">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{[p.projectNumber, p.name].filter(Boolean).join(' · ')}</option>)}
            </select>
          </label>
        </div>

        {project && (
          <div className="px-4 sm:px-6 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-3 flex-wrap text-sm">
            <CalendarClock className="w-4 h-4 text-ocs-600" />
            <span className="font-semibold text-slate-700">{project.projectNumber} due date</span>
            {mayPlan && ready ? (
              <>
                <input type="date" value={projectDue} onChange={(e) => setProjectDue(e.target.value)}
                  aria-label={`Due date for ${project.projectNumber}`}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
                <button type="button" disabled={busy === 'project:due' || projectDue === (project.dueDate || '')} onClick={saveProjectDue}
                  className="px-3 py-1.5 rounded-lg bg-ocs-600 hover:bg-ocs-700 disabled:opacity-40 text-white text-xs font-bold">
                  {busy === 'project:due' ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : <span className="text-slate-600">{project.dueDate || 'Not set'}</span>}
            <span className="text-xs text-slate-500">Every facility in the project is due then, unless it has its own date.</span>
          </div>
        )}

        {(error || done) && (
          <div role={error ? 'alert' : 'status'}
            className={`px-4 sm:px-6 py-2.5 text-[13px] font-semibold border-b ${error ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {error ? <AlertCircle className="w-4 h-4 inline mr-1" /> : <CheckCircle2 className="w-4 h-4 inline mr-1" />}
            {error || done}
          </div>
        )}

        {!visible.length ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            {view === 'action' ? 'Nothing is waiting for review.' : 'No facilities here.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((s) => {
              const stage = STAGE_BY_KEY[stageOf(s)];
              const actions = ready ? workflowActions(currentUser, s) : [];
              const p = projectById.get(s.projectId);
              const overdue = isOverdue(s, today);
              const asking = noteFor?.id === s.id;
              return (
                <li key={s.id} className="px-4 sm:px-6 py-3.5">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{label(s)}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${stage.badge}`}>
                          {stage.key === 'approved' && <Lock className="w-3 h-3 inline mr-0.5 -mt-0.5" />}{stage.label}
                        </span>
                        {overdue && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white">Overdue</span>}
                        <span className="text-[11px] text-slate-500">{s.itemCount || 0} snags · {s.photoCount || 0} photos</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {p ? `${p.projectNumber} · ${p.name}` : 'No project'}
                        {s.submittedAt && ` · submitted ${new Date(s.submittedAt).toLocaleDateString()}`}
                        {s.approvedAt && stage.key === 'approved' && ` · approved ${new Date(s.approvedAt).toLocaleDateString()}`}
                      </p>
                      {s.reviewNote && stage.key !== 'approved' && (
                        <p className="text-xs text-rose-700 mt-1 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1 inline-block">
                          Reviewer: {s.reviewNote}
                        </p>
                      )}
                    </div>

                    <label className="text-[11px] text-slate-500 font-semibold flex flex-col gap-0.5">
                      Due
                      {maySetFacilityDue && ready && stage.key !== 'approved' ? (
                        <input type="date" value={s.dueDate || ''} disabled={busy === `${s.id}:due`}
                          onChange={(e) => changeDue(s, e.target.value)}
                          title={!s.dueDate && s.effectiveDue ? `From the project: ${s.effectiveDue}` : undefined}
                          className={`px-2 py-1 rounded-lg border text-xs ${overdue ? 'border-rose-300 text-rose-700' : 'border-slate-300 text-slate-700'}`} />
                      ) : (
                        <span className={`text-xs ${overdue ? 'text-rose-700 font-bold' : 'text-slate-700'}`}>{s.effectiveDue || '—'}</span>
                      )}
                      {!s.dueDate && s.effectiveDue && <span className="font-normal text-slate-400">project: {s.effectiveDue}</span>}
                    </label>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button type="button" onClick={() => onOpenSurvey?.(s.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5">
                        <FolderOpen className="w-3.5 h-3.5" /> Open
                      </button>
                      {actions.map((a) => {
                        const Icon = ACTION_ICONS[a];
                        const needsNote = a === 'request_changes' || a === 'reopen';
                        return (
                          <button key={a} type="button" disabled={!!busy}
                            onClick={() => (needsNote ? (setNoteFor({ id: s.id, action: a }), setNote('')) : run(s, a))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 ${ACTION_STYLES[a]}`}>
                            {busy === `${s.id}:${a}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                            {ACTION_LABELS[a]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {asking && (
                    <form className="mt-3 flex items-start gap-2 flex-wrap"
                      onSubmit={(e) => { e.preventDefault(); run(s, noteFor.action, note); }}>
                      <label htmlFor={`note-${s.id}`} className="sr-only">
                        {noteFor.action === 'request_changes' ? 'What needs changing' : 'Why it is being reopened'}
                      </label>
                      <textarea id={`note-${s.id}`} rows={2} autoFocus value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder={noteFor.action === 'request_changes' ? 'What should the surveyor change? They will see this note.' : 'Why is it being reopened? (optional)'}
                        className="flex-1 min-w-[260px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      <button type="submit" disabled={!!busy || (noteFor.action === 'request_changes' && !note.trim())}
                        className={`px-3.5 py-2 rounded-xl text-sm font-bold disabled:opacity-50 ${noteFor.action === 'request_changes' ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-ocs-600 hover:bg-ocs-700 text-white'}`}>
                        {noteFor.action === 'request_changes' ? 'Send back' : 'Reopen'}
                      </button>
                      <button type="button" onClick={() => setNoteFor(null)} className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!reviewers && can(currentUser, 'approve_surveys') === false && (
        <p className="text-xs text-slate-500">Your role can see this queue but not review or approve.</p>
      )}
    </div>
  );
}
