import { test, expect, vi } from 'vitest';
import { backTarget, installAndroidBackHandler } from '../utils/backNavigation';
import { isLegacyQhse, moveLegacyQhse } from '../qhse/legacy';

test('QHSE back follows inspection, project list, project picker, module chooser', () => {
  expect(backTarget({ view: 'survey', qhse: true, hasProject: true }).view).toBe('qhse');
  expect(backTarget({ view: 'qhse' }).view).toBe('projects');
  expect(backTarget({ view: 'projects' }).view).toBe('modules');
  expect(backTarget({ view: 'modules' })).toBeNull();
});
test('FM tabs and project tools have usable parent screens', () => {
  expect(backTarget({ view: 'survey', activeTab: 'items', hasProject: true }).tab).toBe('facility');
  expect(backTarget({ view: 'survey', hasProject: true }).view).toBe('facilities');
  expect(backTarget({ view: 'reports', hasProject: true }).view).toBe('facilities');
  expect(backTarget({ view: 'admin' }).view).toBe('modules');
});
test('Android back listener reaches app navigation and is removed once even when unmounted during registration', async () => {
  let finishRegistration;
  const remove = vi.fn(), back = vi.fn();
  const app = { addListener: vi.fn(() => new Promise(resolve => { finishRegistration = resolve; })) };
  const cleanup = installAndroidBackHandler(app, back);
  expect(app.addListener.mock.calls[0][0]).toBe('backButton');
  app.addListener.mock.calls[0][1](); expect(back).toHaveBeenCalledOnce();
  const pendingCleanup = cleanup(); finishRegistration({ remove });
  await pendingCleanup; await cleanup(); expect(remove).toHaveBeenCalledOnce();
});
test('legacy matching does not move ordinary inspections or a QHSE office', () => {
  expect(isLegacyQhse({ title: 'Building inspection' })).toBe(false);
  expect(isLegacyQhse({ facilityName: 'QHSE office' })).toBe(false);
  expect(isLegacyQhse({ title: 'QHSE Site Inspection Report' })).toBe(true);
  expect(isLegacyQhse({ facility: { facilityName: 'Mall - QHSE' } })).toBe(true);
});
test('moving a legacy report preserves record/project IDs, all items, photos, remarks and original metadata', () => {
  const original = { id: 'existing', projectId: 'project', title: 'QHSE Inspection', facility: { facilityName: 'Old title', address: 'Site' },
    items: [{ id: 'finding', defectDescription: 'Observation', customValues: { originalField: 'retain' }, photos: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, caption: `Remark ${i}` })) }] };
  const before = structuredClone(original), moved = moveLegacyQhse(original, { name: 'Selected project' });
  expect(moved.id).toBe(original.id); expect(moved.projectId).toBe(original.projectId);
  expect(moved.items).toEqual(original.items); expect(moved.facility.qhse.migratedFrom.facility).toEqual(original.facility);
  expect(moved.facility.qhse.projectName).toBe('Selected project'); expect(original).toEqual(before);
  expect(moveLegacyQhse(moved)).toBe(moved);
});
