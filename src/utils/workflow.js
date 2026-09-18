/**
 * Review and approval (Stage 6).
 *
 *   Draft -> Submitted -> In review -> Approved
 *   Changes requested: sent back to the surveyor with a note, then submitted again.
 *
 * A facility's stage comes from two fields: `status` (draft / submitted, which
 * the mobile app has always written) and `reviewStatus` (in_review /
 * changes_requested / approved, which only the database's fm_workflow_move()
 * can change). Approved facilities are locked by the database until someone
 * with Approve reopens them.
 */
import { supabase, isCloudConfigured } from './supabaseClient';
import { can } from './auth';

export const STAGES = [
  { key: 'draft', label: 'Draft', short: 'Draft', color: '#f59e0b', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'changes_requested', label: 'Changes requested', short: 'Changes', color: '#f43f5e', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  { key: 'submitted', label: 'Submitted', short: 'Submitted', color: '#0ea5e9', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  { key: 'in_review', label: 'In review', short: 'In review', color: '#8b5cf6', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  { key: 'approved', label: 'Approved', short: 'Approved', color: '#10b981', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
];
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/** The review status as held on a list row or a pulled facility. */
export const reviewStatusOf = (s) => s?.reviewStatus ?? s?.review?.status ?? null;

export function stageOf(s) {
  const review = reviewStatusOf(s);
  const submitted = s?.status === 'submitted';
  if (review === 'approved') return 'approved';
  if (!submitted) return review === 'changes_requested' ? 'changes_requested' : 'draft';
  return review === 'in_review' ? 'in_review' : 'submitted';
}

export const isLocked = (s) => stageOf(s) === 'approved';

/** Today as YYYY-MM-DD in local time -- due dates are calendar days, not instants. */
export function todayISO(now = new Date()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The facility's own due date, else its project's. */
export const effectiveDue = (s, project) => s?.dueDate || project?.dueDate || null;

/** Past its due date and not yet approved. Needs `effectiveDue` on the row (see withDueDates). */
export function isOverdue(s, today = todayISO()) {
  const due = s?.effectiveDue;
  return !!due && due < today && stageOf(s) !== 'approved';
}

/** List rows with each facility's effective due date resolved from its project. */
export function withDueDates(rows = [], projects = []) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return rows.map((s) => {
    const due = effectiveDue(s, byId.get(s.projectId));
    return s.effectiveDue === due ? s : { ...s, effectiveDue: due };
  });
}

/** The workflow steps this user may take on a facility at its current stage. */
export function workflowActions(user, s) {
  const stage = stageOf(s);
  const review = can(user, 'review_surveys');
  const approve = can(user, 'approve_surveys');
  const out = [];
  if (stage === 'submitted' && review) out.push('start_review');
  if ((stage === 'submitted' || stage === 'in_review') && approve) out.push('approve');
  if ((stage === 'submitted' || stage === 'in_review') && review) out.push('request_changes');
  if (stage === 'approved' && approve) out.push('reopen');
  return out;
}

export const ACTION_LABELS = {
  start_review: 'Start review',
  approve: 'Approve',
  request_changes: 'Request changes',
  reopen: 'Reopen'
};

let backendReady = null;

/** Whether the database has the Stage 6 columns yet (see rolesBackendReady). */
export async function workflowBackendReady() {
  if (!isCloudConfigured) return false;
  if (backendReady !== null) return backendReady;
  const { error } = await supabase.from('condition_surveys').select('review_status').limit(1);
  const missing = !!error && (error.code === '42703' || /review_status/.test(error.message || ''));
  if (!error || missing) backendReady = !missing;
  return !missing;
}

/** Moves a facility one step. Returns the facility's new review fields. */
export async function moveFacility(surveyId, action, note = null) {
  const { data, error } = await supabase.rpc('fm_workflow_move', {
    p_survey_id: surveyId, p_action: action, p_note: note
  });
  if (error) throw new Error(String(error.message || 'That step could not be taken.').replace(/^Refused:\s*/, ''));
  const row = Array.isArray(data) ? data[0] : data;
  return reviewFieldsFromRow(row || {});
}

/** The review fields of a condition_surveys row, as the app holds them. */
export function reviewFieldsFromRow(r) {
  return {
    status: r.status || 'draft',
    reviewStatus: r.review_status ?? null,
    reviewNote: r.review_note ?? null,
    reviewedAt: r.reviewed_at ?? null,
    approvedAt: r.approved_at ?? null,
    dueDate: r.due_date ?? null,
    revision: r.revision
  };
}

export async function setFacilityDueDate(surveyId, dueDate) {
  const { error } = await supabase.from('condition_surveys')
    .update({ due_date: dueDate || null }).eq('id', surveyId);
  if (error) throw new Error(String(error.message || 'Could not change the due date.').replace(/^Refused:\s*/, ''));
}

export async function setProjectDueDate(projectId, dueDate) {
  const { error } = await supabase.from('projects')
    .update({ due_date: dueDate || null }).eq('id', projectId);
  if (error) throw new Error(String(error.message || 'Could not change the due date.').replace(/^Refused:\s*/, ''));
}

/** Plain wording for an upload the database refused because the facility is approved. */
export const isLockedRefusal = (err) => /approved and locked/i.test(String(err?.message || err || ''));
