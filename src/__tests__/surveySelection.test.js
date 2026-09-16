import { describe, test, expect } from 'vitest';
import { chooseSurveyToOpen, sortDate, mergeSurveyLists } from '../utils/surveySelection';

const snag = (text) => ({ id: text, defectDescription: text, photos: [] });

describe('chooseSurveyToOpen', () => {
  const remote = { id: 'f1', items: [snag('server snag')], pendingSync: false };

  test('keeps the device copy when it holds edits that never uploaded', () => {
    // Regression: opening took the server copy and saved it over these edits.
    const local = { id: 'f1', items: [snag('server snag'), snag('unsent snag')], pendingSync: true };
    const r = chooseSurveyToOpen(local, remote);
    expect(r.source).toBe('local');
    expect(r.reason).toBe('unsent-edits');
    expect(r.survey.items.map((i) => i.id)).toContain('unsent snag');
  });

  test('prefers the server copy when the device copy is already synced', () => {
    const local = { id: 'f1', items: [snag('old')], pendingSync: false };
    expect(chooseSurveyToOpen(local, remote)).toMatchObject({ source: 'remote', reason: 'server' });
  });

  test('opens the device copy when the server cannot be reached', () => {
    const local = { id: 'f1', items: [snag('offline snag')], pendingSync: false };
    expect(chooseSurveyToOpen(local, null)).toMatchObject({ source: 'local', reason: 'device-copy' });
  });

  test('uses the server copy when nothing is on the device', () => {
    expect(chooseSurveyToOpen(null, remote)).toMatchObject({ source: 'remote' });
  });

  test('reports unavailable when neither copy exists', () => {
    expect(chooseSurveyToOpen(null, null)).toEqual({ survey: null, source: null, reason: 'unavailable' });
  });

  test('does not treat a missing pendingSync flag as unsent', () => {
    const local = { id: 'f1', items: [] };
    expect(chooseSurveyToOpen(local, remote).source).toBe('remote');
  });
});

describe('sortDate', () => {
  test('uses the submitted date the row displays, not the last sync time', () => {
    // Regression: a facility submitted on the 8th but re-synced on the 15th
    // sorted as the 15th while its row read "Submitted 08/09".
    const s = { submittedAt: '2026-09-08T06:52:00Z', updatedAt: '2026-09-15T15:12:00Z' };
    expect(sortDate(s)).toBe(Date.parse('2026-09-08T06:52:00Z'));
  });

  test('falls back to updatedAt for drafts', () => {
    expect(sortDate({ updatedAt: '2026-09-10T00:00:00Z' })).toBe(Date.parse('2026-09-10T00:00:00Z'));
  });

  test('sorts missing or invalid dates last instead of throwing', () => {
    expect(sortDate({})).toBe(0);
    expect(sortDate({ updatedAt: 'nonsense' })).toBe(0);
    expect(sortDate(null)).toBe(0);
  });

  test('orders newest first by the displayed date', () => {
    const rows = [
      { n: 'resynced-old', submittedAt: '2026-09-08T06:52:00Z', updatedAt: '2026-09-15T15:12:00Z' },
      { n: 'recent', submittedAt: '2026-09-14T10:05:00Z', updatedAt: '2026-09-14T10:05:00Z' }
    ];
    expect([...rows].sort((a, b) => sortDate(b) - sortDate(a)).map((r) => r.n)).toEqual(['recent', 'resynced-old']);
  });
});

describe('mergeSurveyLists', () => {
  test('keeps projectId on facilities that exist only on this device', () => {
    // Regression: it was dropped, so the project screen filtered every
    // not-yet-uploaded facility out and showed an empty list offline.
    const local = [{ id: 'd1', projectId: 'p1', items: [snag('a')], pendingSync: true, updatedAt: '2026-09-15T00:00:00Z' }];
    const [row] = mergeSurveyLists([], local);
    expect(row).toMatchObject({ id: 'd1', projectId: 'p1', pendingSync: true, localOnly: true, onDevice: true });
  });

  test('marks a server facility as unsent when this device has pending edits for it', () => {
    const remote = [{ id: 'f1', projectId: 'p1', itemCount: 1, updatedAt: '2026-09-14T00:00:00Z' }];
    const local = [{ id: 'f1', projectId: 'p1', items: [snag('a'), snag('b')], pendingSync: true }];
    const [row] = mergeSurveyLists(remote, local);
    expect(row).toMatchObject({ id: 'f1', pendingSync: true, onDevice: true });
  });

  test('lists each facility once when it is on both the server and the device', () => {
    const remote = [{ id: 'f1', projectId: 'p1', updatedAt: '2026-09-14T00:00:00Z' }];
    const local = [{ id: 'f1', projectId: 'p1', items: [snag('a')], pendingSync: false }];
    expect(mergeSurveyLists(remote, local)).toHaveLength(1);
  });

  test('leaves out blank scratch surveys that were never submitted', () => {
    expect(mergeSurveyLists([], [{ id: 'blank', items: [], pendingSync: true }])).toHaveLength(0);
  });

  test('flags rows known only from the cached list as not on the device', () => {
    const remote = [{ id: 'other-device', projectId: 'p1', updatedAt: '2026-09-14T00:00:00Z' }];
    const [row] = mergeSurveyLists(remote, [], { remoteIsCached: true });
    expect(row).toMatchObject({ cached: true, onDevice: false });
  });
});
