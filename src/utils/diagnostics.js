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

// The last reason an upload failed, kept in memory for this tab only, so the
// sync warning can say what failed instead of always blaming the connection.
let lastSyncProblem = null;
export function recordSyncProblem(err) {
  const message = String(err?.message || err || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (message) lastSyncProblem = { message, at: Date.now() };
}
export function latestSyncProblem() { return lastSyncProblem; }
