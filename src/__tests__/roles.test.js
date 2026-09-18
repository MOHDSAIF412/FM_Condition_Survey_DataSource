import { describe, test, expect } from 'vitest';
import { hasPermission, roleKey, roleOf, isAdminUser, isSuperAdmin, DEFAULT_ROLES, PERMISSIONS } from '../utils/roles';

describe('roles', () => {
  test('accounts from before Stage 5 read as their new roles', () => {
    expect(roleKey({ role: 'user' })).toBe('surveyor');
    // 'admin' is also the new Admin role: never silently promoted to Super Admin.
    expect(roleKey({ role: 'admin' })).toBe('admin');
    expect(roleKey({ role: 'nonsense' })).toBe('viewer');   // unknown never means more access
  });

  test('administrators hold every permission; deactivated accounts none', () => {
    for (const p of PERMISSIONS) {
      expect(hasPermission({ role: 'admin' }, p.key)).toBe(true);
      expect(hasPermission({ role: 'super_admin', is_active: false }, p.key)).toBe(false);
    }
    expect(isAdminUser({ role: 'admin' })).toBe(true);
    expect(isSuperAdmin({ role: 'admin' })).toBe(false);
    expect(isSuperAdmin({ role: 'super_admin' })).toBe(true);
  });

  test('a role gives its permissions, and a user\'s own ticks add to them', () => {
    const surveyor = { role: 'surveyor', permissions: {} };
    expect(hasPermission(surveyor, 'edit_surveys')).toBe(true);
    expect(hasPermission(surveyor, 'delete_snags')).toBe(false);
    expect(hasPermission({ ...surveyor, permissions: { delete_snags: true } }, 'delete_snags')).toBe(true);
    expect(hasPermission({ role: 'client' }, 'edit_surveys')).toBe(false);
    expect(hasPermission({ role: 'client' }, 'download_reports')).toBe(true);
    expect(hasPermission({ role: 'viewer' }, 'download_reports')).toBe(false);
  });

  test('the role as loaded from the server wins over the built-in default', () => {
    const user = { role: 'viewer', roleInfo: { key: 'viewer', permissions: { download_reports: true } } };
    expect(hasPermission(user, 'download_reports')).toBe(true);
    expect(roleOf({ role: 'viewer', roleInfo: { key: 'client', permissions: {} } }).key).toBe('viewer'); // stale roleInfo ignored
  });

  test('only an explicit true grants', () => {
    expect(hasPermission({ role: 'viewer', permissions: { delete_snags: 'true' } }, 'delete_snags')).toBe(false);
  });

  test('defaults: seven roles, only administrators fixed, clients approved-only', () => {
    expect(DEFAULT_ROLES.map((r) => r.key)).toEqual(['super_admin', 'admin', 'manager', 'surveyor', 'engineer', 'client', 'viewer']);
    expect(DEFAULT_ROLES.filter((r) => r.locked).map((r) => r.key)).toEqual(['super_admin', 'admin']);
    expect(DEFAULT_ROLES.filter((r) => r.approved_only).map((r) => r.key)).toEqual(['client']);
  });
});

test('the database seed matches the built-in roles exactly', async () => {
  const seed = (await import('./fixtures_stage5_roles.json')).default;
  const norm = (r) => ({ ...r, permissions: Object.fromEntries(Object.entries(r.permissions).sort()) });
  expect(seed.map(norm)).toEqual(DEFAULT_ROLES.map(norm));
});
