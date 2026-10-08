import { test, expect, vi } from 'vitest';
vi.mock('../utils/supabaseClient', () => ({ isCloudConfigured: false, supabase: null }));
const { cachedProjects, listProjects, setProjectDeleted } = await import('../utils/projects');
test('deleted projects disappear from the picker and can be restored from the cached trash', async () => {
  const store = new Map([['fm_projects_cache', JSON.stringify([{ id: 'p', name: 'Project', notes: 'Notes' }])]]);
  vi.stubGlobal('localStorage', { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v) });
  try {
    await setProjectDeleted({ id: 'p' }, true);
    expect(cachedProjects()).toEqual([]); expect(await listProjects()).toEqual([]);
    const deleted = await listProjects({ includeDeleted: true }); expect(deleted).toHaveLength(1); expect(deleted[0].notes).toBe('Notes');
    await setProjectDeleted(deleted[0], false);
    expect(cachedProjects()).toEqual([{ id: 'p', name: 'Project', notes: 'Notes', deletedAt: null }]);
  } finally { vi.unstubAllGlobals(); }
});
