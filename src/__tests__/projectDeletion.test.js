import { test, expect, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ records: [], patch: null, original: { notes: 'Keep original notes', updated_at: 'old-revision' }, refused: false, checks: [] }));
vi.mock('../utils/supabaseClient', () => ({ isCloudConfigured: true, supabase: { from: table => {
  let writing = false;
  const query = {
    select: () => query, eq: (key, value) => { if (writing) state.checks.push([key,value]); return query; }, is: () => query,
    update: patch => { writing = true; state.patch = patch; return query; },
    range: async () => ({ data: state.records, error: null }),
    single: async () => writing ? { data: state.refused ? null : { id: 'p' }, error: state.refused ? { message: 'Changed' } : null } : { data: state.original, error: null }
  };
  return query;
} } }));
const { setProjectDeleted } = await import('../utils/projects');
const { readProjectTrash } = await import('../utils/projectTrash');
beforeEach(() => { state.records = []; state.patch = null; state.refused = false; state.checks = []; state.original = { notes: 'Keep original notes', updated_at: 'old-revision' }; });
test('shared projects cannot be removed while either FM facilities or live QHSE inspections remain', async () => {
  for (const facility of [{ facilityName: 'FM' }, { module: 'qhse', qhse: {} }]) {
    state.records = [{ id: 'report', facility }];
    await expect(setProjectDeleted({ id: 'p' }, true)).rejects.toThrow('existing inspections and Condition Survey');
    expect(state.patch).toBeNull();
  }
});
test('project deletion retains deleted inspection records and notes and refuses a concurrent project edit', async () => {
  state.records = [{ id: 'deleted', facility: { module: 'qhse', qhse: { deletedAt: 'date' } } }];
  await setProjectDeleted({ id: 'p' }, true);
  expect(readProjectTrash(state.patch.notes).notes).toBe('Keep original notes');
  expect(state.checks).toContainEqual(['updated_at','old-revision']);
  state.original.notes = state.patch.notes;
  await setProjectDeleted({ id: 'p' }, false); expect(state.patch.notes).toBe('Keep original notes');
  state.refused = true; await expect(setProjectDeleted({ id: 'p' }, true)).rejects.toThrow('Refresh');
});
