import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: {}, isCloudConfigured: false }));

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const { can, cachedProfile, clearCachedProfile } = await import('../utils/auth');

describe('can', () => {
  test('admins hold every permission', () => {
    expect(can({ role: 'admin', permissions: {} }, 'delete_snags')).toBe(true);
    expect(can({ role: 'admin' }, 'download_reports')).toBe(true);
  });

  test('a surveyor holds only what was granted', () => {
    const u = { role: 'user', permissions: { download_reports: true } };
    expect(can(u, 'download_reports')).toBe(true);
    expect(can(u, 'delete_snags')).toBe(false);
  });

  test('a deactivated account holds nothing, admin or not', () => {
    expect(can({ role: 'admin', is_active: false }, 'delete_snags')).toBe(false);
    expect(can({ role: 'user', is_active: false, permissions: { delete_snags: true } }, 'delete_snags')).toBe(false);
  });

  test('no user, no permission', () => {
    expect(can(null, 'download_reports')).toBe(false);
  });

  test('only an explicit true grants', () => {
    expect(can({ role: 'user', permissions: { delete_snags: 'true' } }, 'delete_snags')).toBe(false);
  });
});

describe('cachedProfile', () => {
  beforeEach(() => store.clear());

  test('returns the last profile for the same account', () => {
    // Regression: offline launch left an administrator with no role.
    store.set('fm_profile_cache', JSON.stringify({ id: 'u1', role: 'admin', permissions: {} }));
    expect(cachedProfile('u1')).toMatchObject({ id: 'u1', role: 'admin' });
  });

  test('never hands one account another account\'s profile', () => {
    store.set('fm_profile_cache', JSON.stringify({ id: 'admin-user', role: 'admin' }));
    expect(cachedProfile('someone-else')).toBeNull();
  });

  test('is cleared on sign-out', () => {
    store.set('fm_profile_cache', JSON.stringify({ id: 'u1', role: 'admin' }));
    clearCachedProfile();
    expect(cachedProfile('u1')).toBeNull();
  });

  test('survives corrupt storage', () => {
    store.set('fm_profile_cache', '{not json');
    expect(cachedProfile('u1')).toBeNull();
  });
});
