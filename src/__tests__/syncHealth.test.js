import { readFileSync } from 'node:fs';
import { beforeEach, expect, test, vi } from 'vitest';

// Node has no Web Storage; a tiny in-memory stand-in for each.
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear()
  };
}
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('sessionStorage', memoryStorage());
vi.mock('../utils/deviceAccount', () => ({ deviceStorageScope: () => ({ accountId: 'acct-1' }) }));

let diagnostics;
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  vi.resetModules();
  diagnostics = await import('../utils/diagnostics');
});

test('the last sync reason survives a reload of the tab', async () => {
  diagnostics.recordSyncProblem('Adec: changed on another device; open the facility to compare copies');
  vi.resetModules();
  const reloaded = await import('../utils/diagnostics');
  expect(reloaded.latestSyncProblem()?.message).toMatch(/changed on another device/);
});

test('a full successful sync ends the failure streak and forgets the reason', () => {
  for (let i = 0; i < 3; i++) {
    const list = diagnostics.diagnosticEvents();
    localStorage.setItem('fm_diagnostics_acct-1', JSON.stringify([...list, { kind: 'sync_failed', at: Date.now() - i * 20000 }]));
  }
  diagnostics.recordDiagnostic('render_error');
  diagnostics.recordSyncProblem('Photo upload: Failed to fetch');
  diagnostics.clearSyncFailures();
  expect(diagnostics.diagnosticEvents().map((e) => e.kind)).toEqual(['render_error']);
  expect(diagnostics.latestSyncProblem()).toBeNull();
});

test('the warning needs a recent failure, not just three old ones', () => {
  const src = readFileSync(new URL('../components/SyncHealth.jsx', import.meta.url), 'utf8');
  expect(src).toMatch(/recent\.at\(-1\)\.at < 2 \* 60 \* 1000/);
});

test('every App sync failure path records its reason and success clears it', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const report = app.slice(app.indexOf('function reportSyncFailure'), app.indexOf('function reportSyncFailure') + 300);
  expect(report).toMatch(/recordSyncProblem\(err\)/);
  expect(app).toMatch(/clearSyncFailures\(\)/);
  // The retry must not re-upload an unchanged open facility (bumps its revision).
  expect(app).toMatch(/if \(await openSurveyHasUnsentWork\(\)\) \{\s*const res = await pushAndSettle\(\)/);
});
