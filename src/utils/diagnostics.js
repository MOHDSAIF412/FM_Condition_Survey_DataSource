import { deviceStorageScope } from './deviceAccount';
const allowed = new Set(['render_error','unhandled_error','unhandled_rejection','sync_failed','update_failed']);
const key = () => `fm_diagnostics_${deviceStorageScope().accountId || 'device'}`;
export function diagnosticEvents() {
  try { const list = JSON.parse(localStorage.getItem(key()) || '[]'); return Array.isArray(list) ? list.slice(-50) : []; }
  catch { return []; }
}
export function recordDiagnostic(kind) {
  if (!allowed.has(kind)) return;
  const events = diagnosticEvents();
  // Store categories only: no passwords, tokens, report text, photo paths or user names.
  if (events.at(-1)?.kind === kind && Date.now() - events.at(-1).at < 15000) return;
  try { localStorage.setItem(key(), JSON.stringify([...events, { kind, at: Date.now() }].slice(-50))); } catch { /* storage full */ }
}
export function installDiagnostics() {
  window.addEventListener('error', () => recordDiagnostic('unhandled_error'));
  window.addEventListener('unhandledrejection', () => recordDiagnostic('unhandled_rejection'));
}

// The last reason a sync failed, so the warning can say what failed instead of
// always blaming the connection. Kept in sessionStorage (this tab only, gone
// when it closes) because the reason can name a facility; it survives a reload,
// which used to leave the warning up with no reason at all.
const problemKey = () => `fm_sync_problem_${deviceStorageScope().accountId || 'device'}`;
let lastSyncProblem = null;
export function recordSyncProblem(err) {
  const message = String(err?.message || err || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!message) return;
  lastSyncProblem = { message, at: Date.now() };
  try { sessionStorage.setItem(problemKey(), JSON.stringify(lastSyncProblem)); } catch { /* storage unavailable */ }
}
export function latestSyncProblem() {
  if (lastSyncProblem) return lastSyncProblem;
  try { return JSON.parse(sessionStorage.getItem(problemKey()) || 'null'); } catch { return null; }
}

/**
 * A sync that fully succeeded ends the failure streak.
 *
 * Failures used to be counted over a 15-minute window and never reset, so
 * after the server recovered, every later autosave ("Syncing...") brought the
 * "Sync has failed repeatedly" warning back for up to 15 minutes.
 */
export function clearSyncFailures() {
  lastSyncProblem = null;
  try { sessionStorage.removeItem(problemKey()); } catch { /* storage unavailable */ }
  try {
    const kept = diagnosticEvents().filter((e) => e.kind !== 'sync_failed');
    localStorage.setItem(key(), JSON.stringify(kept));
  } catch { /* storage full */ }
}
