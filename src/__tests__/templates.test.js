import { describe, test, expect, vi } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: {}, isCloudConfigured: false }));

import {
  normaliseTemplateItem,
  validateTemplate,
  templatesForType,
  suggestedTemplate,
  isBlankSnag,
  applyTemplateToItems
} from '../utils/templates';
import { createDefaultAsset } from '../types/survey';

const tpl = (over = {}) => ({
  id: 'tpl1',
  name: 'Office standard',
  facilityType: 'OFFICE',
  archived: false,
  items: [
    { description: 'Fire extinguisher out of date', department: 'FIRE_SAFETY', priority: 1 },
    { description: 'AHU filters soiled', department: 'HVAC', priority: 2, location: 'Plant room' }
  ],
  ...over
});

const snag = (description, extra = {}) => ({ ...createDefaultAsset('Lobby', 'GENERAL'), defectDescription: description, ...extra });

describe('normaliseTemplateItem', () => {
  test('unknown department and priority fall back to safe defaults', () => {
    const item = normaliseTemplateItem({ description: ' x ', department: 'NOPE', priority: 9, quantity: -3, estimatedCost: 'abc' });
    expect(item).toMatchObject({ description: 'x', department: 'GENERAL', priority: 2, quantity: 1, estimatedCost: 0, unit: 'Unit' });
    expect(item.id).toBeTruthy();
  });
});

describe('validateTemplate', () => {
  test('needs a name, at least one item, and descriptions on every item', () => {
    expect(validateTemplate({ name: '', items: [] })).toHaveLength(2);
    expect(validateTemplate({ name: 'A', items: [{ description: '' }, { description: 'ok' }] }))
      .toEqual(['1 checklist item has no description.']);
    expect(validateTemplate(tpl())).toEqual([]);
  });
});

describe('templatesForType', () => {
  const all = [
    tpl({ id: 'school', name: 'School', facilityType: 'SCHOOL' }),
    tpl({ id: 'general', name: 'General', facilityType: '' }),
    tpl({ id: 'office', name: 'Office', facilityType: 'OFFICE' }),
    tpl({ id: 'old', name: 'Old office', facilityType: 'OFFICE', archived: true })
  ];

  test('matching type first, then general; other types and archived left out', () => {
    expect(templatesForType(all, 'OFFICE').map((t) => t.id)).toEqual(['office', 'general']);
  });

  test('no type chosen offers only general templates', () => {
    expect(templatesForType(all, '').map((t) => t.id)).toEqual(['general']);
  });

  test('suggests a template only when exactly one live one matches the type', () => {
    expect(suggestedTemplate(all, 'OFFICE')?.id).toBe('office');
    expect(suggestedTemplate(all, 'HOTEL')).toBeNull();
    expect(suggestedTemplate([...all, tpl({ id: 'o2', facilityType: 'OFFICE' })], 'OFFICE')).toBeNull();
  });
});

describe('applyTemplateToItems', () => {
  test('replaces the untouched blank snag a new facility starts with', () => {
    const blank = createDefaultAsset('');
    const out = applyTemplateToItems([blank], tpl());
    expect(out.added).toBe(2);
    expect(out.items).toHaveLength(2);
    expect(out.removedBlankIds).toEqual([String(blank.id)]);
    expect(out.items[1]).toMatchObject({
      defectDescription: 'AHU filters soiled', department: 'HVAC', priority: 2, location: 'Plant room', templateId: 'tpl1'
    });
  });

  test('never removes or changes snags the surveyor has written', () => {
    const written = snag('Cracked tile', { photos: [{ id: 'p1' }] });
    const out = applyTemplateToItems([written], tpl());
    expect(out.items[0]).toBe(written);
    expect(out.items).toHaveLength(3);
    expect(out.removedBlankIds).toEqual([]);
  });

  test('a snag with only a photo is not treated as blank', () => {
    expect(isBlankSnag({ ...createDefaultAsset(''), photos: [{ id: 'p' }] })).toBe(false);
  });

  test('applying twice adds nothing the second time (case and spacing ignored)', () => {
    const first = applyTemplateToItems([], tpl());
    const second = applyTemplateToItems(
      [...first.items, snag('  fire EXTINGUISHER   out of date ')],
      tpl()
    );
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(2);
  });

  test('nothing new leaves the blank snag in place', () => {
    const blank = createDefaultAsset('');
    const out = applyTemplateToItems([blank], tpl({ items: [] }));
    expect(out.items).toEqual([blank]);
    expect(out.removedBlankIds).toEqual([]);
  });

  test('new snags get distinct ids', () => {
    const out = applyTemplateToItems([], tpl());
    expect(new Set(out.items.map((i) => i.id)).size).toBe(2);
  });
});
