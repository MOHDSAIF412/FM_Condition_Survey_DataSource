import { describe, test, expect } from 'vitest';
import {
  normaliseFormsConfig, defaultFormsConfig, validateFormsConfig, describeChanges,
  makeFieldKey, fieldsForSection, systemField, SYSTEM_FIELDS, SYSTEM_SECTIONS
} from '../config/formConfig';
import { canChangeType, formatValue, isEmptyValue } from '../config/fieldTypes';

const criticality = (over = {}) => ({
  id: 'fld_crit', key: 'assetCriticality', scope: 'snag', sectionId: 'snag_details',
  label: 'Asset Criticality', type: 'dropdown', required: true,
  options: [
    { id: 'o1', value: 'low', label: 'Low', order: 0 },
    { id: 'o2', value: 'medium', label: 'Medium', order: 1 },
    { id: 'o3', value: 'high', label: 'High', order: 2 },
    { id: 'o4', value: 'critical', label: 'Critical', order: 3 }
  ],
  ...over
});

describe('normaliseFormsConfig', () => {
  test('default reproduces every built-in section and field', () => {
    const c = defaultFormsConfig();
    expect(c.sections.filter((s) => s.system)).toHaveLength(SYSTEM_SECTIONS.length);
    expect(c.fields.filter((f) => f.system)).toHaveLength(SYSTEM_FIELDS.length);
    expect(validateFormsConfig(c)).toEqual([]);
  });

  test('a stored config cannot remove, retype or unlock built-in fields', () => {
    const c = normaliseFormsConfig({
      fields: [{ id: 'sys_snag_priority', label: 'Urgency', type: 'text', hidden: true, archived: true }],
      sections: []
    });
    const p = c.fields.find((f) => f.id === 'sys_snag_priority');
    expect(p).toMatchObject({ label: 'Urgency', type: 'dropdown', hidden: false, archived: false, system: true });
    expect(c.fields.filter((f) => f.system)).toHaveLength(SYSTEM_FIELDS.length);
  });

  test('hideable built-in fields keep their hidden setting', () => {
    const c = normaliseFormsConfig({ fields: [{ id: 'sys_snag_quantity', hidden: true, pdf: false }] });
    expect(systemField(c, 'snag', 'quantity')).toMatchObject({ hidden: true, pdf: false });
  });

  test('a custom field whose section vanished moves to the first section of its scope', () => {
    const c = normaliseFormsConfig({ fields: [criticality({ sectionId: 'gone' })] });
    expect(c.fields.find((f) => f.id === 'fld_crit').sectionId).toBe('snag_details');
  });

  test('archived fields stay in the config but leave the active list', () => {
    const c = normaliseFormsConfig({ fields: [criticality({ archived: true })] });
    expect(c.fields.some((f) => f.id === 'fld_crit')).toBe(true);
    expect(fieldsForSection(c, 'snag_details').some((f) => f.id === 'fld_crit')).toBe(false);
    expect(fieldsForSection(c, 'snag_details', { includeArchived: true }).some((f) => f.id === 'fld_crit')).toBe(true);
  });
});

describe('validateFormsConfig', () => {
  test('the Asset Criticality example is valid', () => {
    expect(validateFormsConfig(normaliseFormsConfig({ fields: [criticality()] }))).toEqual([]);
  });

  test('catches duplicate keys, empty dropdowns and duplicate options', () => {
    const c = normaliseFormsConfig({
      fields: [
        criticality(),
        criticality({ id: 'fld_2', label: 'Other', options: [] }),
        criticality({ id: 'fld_3', key: 'x', label: 'Dup', options: [{ value: 'a', label: 'A' }, { value: 'A', label: 'A again' }] }),
        { id: 'fld_4', key: 'location', scope: 'snag', label: 'Clash', type: 'text' }
      ]
    });
    const problems = validateFormsConfig(c).join(' | ');
    expect(problems).toMatch(/share the key "assetCriticality"/);
    expect(problems).toMatch(/"Other" needs at least one active option/);
    expect(problems).toMatch(/"Dup" has the option "A again" twice/);
    expect(problems).toMatch(/share the key "location"/);
  });

  test('a field type that is not available yet cannot be saved', () => {
    const c = normaliseFormsConfig({ fields: [{ id: 'f', key: 'sig', scope: 'snag', label: 'Sign', type: 'signature' }] });
    expect(validateFormsConfig(c).join()).toMatch(/not available yet/);
  });

  test('rules must point at real fields', () => {
    const c = normaliseFormsConfig({
      fields: [criticality()],
      rules: [{ name: 'R', scope: 'snag', conditions: [{ fieldKey: 'nope', op: 'equals', value: 'x' }], actions: [{ type: 'show', fieldKey: 'assetCriticality' }] }]
    });
    expect(validateFormsConfig(c).join()).toMatch(/R checks a field that does not exist/);
  });
});

describe('describeChanges', () => {
  test('lists additions, renames, archiving and report switches in plain English', () => {
    const before = normaliseFormsConfig({ fields: [criticality()] });
    const after = normaliseFormsConfig({
      fields: [
        criticality({
          label: 'Criticality',
          pdf: false,
          options: [...criticality().options.slice(0, 3), { id: 'o4', value: 'critical', label: 'Critical', archived: true, order: 3 }]
        }),
        { id: 'fld_new', key: 'recommendation', scope: 'snag', sectionId: 'snag_details', label: 'Recommendation', type: 'textarea' }
      ],
      sections: [{ id: 'snag_details', label: 'Details' }]
    });
    const lines = describeChanges(before, after);
    expect(lines).toContain('Renamed field "Asset Criticality" to "Criticality"');
    expect(lines).toContain('"Criticality": PDF report off');
    expect(lines).toContain('"Criticality": archived option "Critical"');
    expect(lines).toContain('Added snag field "Recommendation" (Long text)');
    expect(lines).toContain('Renamed section "Snag Details" to "Details"');
  });

  test('no changes, no lines', () => {
    const c = normaliseFormsConfig({ fields: [criticality()] });
    expect(describeChanges(c, JSON.parse(JSON.stringify(c)))).toEqual([]);
  });
});

describe('field helpers', () => {
  test('keys are camel-case and unique', () => {
    expect(makeFieldKey('Asset Criticality')).toBe('assetCriticality');
    expect(makeFieldKey('Asset Criticality', ['assetCriticality'])).toBe('assetCriticality2');
    expect(makeFieldKey('2nd inspection')).toBe('f2ndInspection');
  });

  test('type changes after publishing only when answers keep their meaning', () => {
    expect(canChangeType('text', 'number', { published: false })).toBe(true);
    expect(canChangeType('text', 'number', { published: true })).toBe(false);
    expect(canChangeType('dropdown', 'multiselect', { published: true })).toBe(true);
    expect(canChangeType('multiselect', 'dropdown', { published: true })).toBe(false);
    expect(canChangeType('text', 'photo')).toBe(false);
  });

  test('values format for reports', () => {
    const f = criticality();
    expect(formatValue(f, 'critical')).toBe('Critical');
    expect(formatValue({ ...f, type: 'multiselect' }, ['low', 'high'])).toBe('Low, High');
    expect(formatValue({ type: 'yesno' }, 'no')).toBe('No');
    expect(formatValue({ type: 'checkbox' }, false)).toBe('No');
    expect(isEmptyValue('checkbox', false)).toBe(true);
  });
});
