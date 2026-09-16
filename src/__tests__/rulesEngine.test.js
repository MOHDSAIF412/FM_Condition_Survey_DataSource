import { describe, test, expect } from 'vitest';
import { normaliseFormsConfig } from '../config/formConfig';
import { evaluateRules, fieldState, missingRequired, submissionProblems, conditionMatches } from '../config/rulesEngine';

const config = normaliseFormsConfig({
  sections: [{ id: 'sec_extra', scope: 'snag', label: 'Assessment' }],
  fields: [
    { id: 'f_cond', key: 'condition', scope: 'snag', sectionId: 'sec_extra', label: 'Condition', type: 'dropdown',
      options: [{ value: 'good', label: 'Good' }, { value: 'critical', label: 'Critical' }] },
    { id: 'f_def', key: 'defect', scope: 'snag', sectionId: 'sec_extra', label: 'Defect', type: 'text', hidden: true },
    { id: 'f_rec', key: 'recommendation', scope: 'snag', sectionId: 'sec_extra', label: 'Recommendation', type: 'textarea', hidden: true, required: true },
    { id: 'f_crit', key: 'assetCriticality', scope: 'snag', sectionId: 'snag_details', label: 'Asset Criticality', type: 'dropdown', required: true,
      options: [{ value: 'low', label: 'Low' }] },
    { id: 'f_web', key: 'webOnly', scope: 'snag', sectionId: 'snag_details', label: 'Web only note', type: 'text', required: true, mobile: false },
    { id: 'f_site', key: 'siteManager', scope: 'facility', sectionId: 'facility_identification', label: 'Site Manager', type: 'text', required: true }
  ],
  rules: [{
    id: 'r1', name: 'Critical needs evidence', scope: 'snag',
    conditions: [{ fieldKey: 'condition', op: 'equals', value: 'critical' }],
    actions: [{ type: 'show', fieldKey: 'defect' }, { type: 'show', fieldKey: 'recommendation' }, { type: 'require', fieldKey: 'photos' }]
  }]
});

const field = (key) => config.fields.find((f) => f.key === key && f.scope === 'snag');

describe('the Critical example', () => {
  test('not critical: defect and recommendation stay hidden, photos not required', () => {
    const r = evaluateRules(config.rules, 'snag', { condition: 'good' });
    expect(fieldState(field('defect'), r).visible).toBe(false);
    expect(fieldState(field('recommendation'), r)).toEqual({ visible: false, required: false });
    expect(r.fired).toEqual([]);
  });

  test('critical: both shown and photo becomes required', () => {
    const r = evaluateRules(config.rules, 'snag', { condition: 'critical' });
    expect(fieldState(field('defect'), r).visible).toBe(true);
    expect(fieldState(field('recommendation'), r)).toEqual({ visible: true, required: true });
    expect(r.required.photos).toBe(true);
  });

  test('required checks follow the rule, including built-in photos', () => {
    const item = { location: 'Roof', photos: [], customValues: { condition: 'critical', assetCriticality: 'low', webOnly: 'x' } };
    expect(missingRequired(config, 'snag', item)).toEqual(['Recommendation', 'Photos']);
    const fixed = { ...item, photos: [{ id: 'p' }], customValues: { ...item.customValues, recommendation: 'Replace' } };
    expect(missingRequired(config, 'snag', fixed)).toEqual([]);
  });
});

describe('rule semantics', () => {
  test('later rules win over earlier ones', () => {
    const rules = [
      { id: 'a', scope: 'snag', conditions: [{ fieldKey: 'x', op: 'is_not_empty' }], actions: [{ type: 'show', fieldKey: 'y' }] },
      { id: 'b', scope: 'snag', conditions: [{ fieldKey: 'x', op: 'equals', value: 'stop' }], actions: [{ type: 'hide', fieldKey: 'y' }] }
    ];
    expect(evaluateRules(rules, 'snag', { x: 'go' }).visible.y).toBe(true);
    expect(evaluateRules(rules, 'snag', { x: 'stop' }).visible.y).toBe(false);
  });

  test('disabled, archived and other-scope rules do nothing; "any" matching works', () => {
    const base = {
      conditions: [{ fieldKey: 'x', op: 'equals', value: '1' }, { fieldKey: 'z', op: 'equals', value: '2' }],
      actions: [{ type: 'hide', fieldKey: 'y' }]
    };
    expect(evaluateRules([{ ...base, id: 'd', scope: 'snag', enabled: false, match: 'any' }], 'snag', { x: '1' }).fired).toEqual([]);
    expect(evaluateRules([{ ...base, id: 'd', scope: 'snag', archived: true, match: 'any' }], 'snag', { x: '1' }).fired).toEqual([]);
    expect(evaluateRules([{ ...base, id: 'd', scope: 'facility', match: 'any' }], 'snag', { x: '1' }).fired).toEqual([]);
    expect(evaluateRules([{ ...base, id: 'd', scope: 'snag', match: 'any' }], 'snag', { x: '1' }).fired).toEqual(['d']);
    expect(evaluateRules([{ ...base, id: 'd', scope: 'snag', match: 'all' }], 'snag', { x: '1' }).fired).toEqual([]);
  });

  test('operators', () => {
    expect(conditionMatches({ fieldKey: 'p', op: 'equals', value: '1' }, { p: 1 })).toBe(true);
    expect(conditionMatches({ fieldKey: 'p', op: 'any_of', value: ['1', '2'] }, { p: 2 })).toBe(true);
    expect(conditionMatches({ fieldKey: 'm', op: 'contains', value: 'hvac' }, { m: ['HVAC', 'Fire'] })).toBe(true);
    expect(conditionMatches({ fieldKey: 'c', op: 'greater_than', value: '1000' }, { c: 5000 })).toBe(true);
    expect(conditionMatches({ fieldKey: 'c', op: 'greater_than', value: '1000' }, { c: '' })).toBe(false);
    expect(conditionMatches({ fieldKey: 't', op: 'is_empty' }, { t: '  ' })).toBe(true);
    expect(conditionMatches({ fieldKey: 'm', op: 'is_not_empty' }, { m: [] })).toBe(false);
    expect(conditionMatches({ fieldKey: 't', op: 'equals', value: 'Critical' }, { t: ' critical ' })).toBe(true);
  });
});

describe('submissionProblems', () => {
  const survey = {
    facility: { facilityName: 'Block A', custom: {} },
    items: [
      { location: 'Roof', photos: [], customValues: {} },
      { location: '', photos: [], customValues: { assetCriticality: 'low', webOnly: 'ok' } }
    ]
  };

  test('lists what is missing, per facility and per snag', () => {
    expect(submissionProblems(config, survey, 'web')).toEqual([
      'Facility: Site Manager',
      'Snag #1 (Roof): Asset Criticality, Web only note'
    ]);
  });

  test('a field not shown on this platform is not required there', () => {
    expect(submissionProblems(config, survey, 'mobile')).toEqual([
      'Facility: Site Manager',
      'Snag #1 (Roof): Asset Criticality'
    ]);
  });

  test('archived custom fields are never required', () => {
    const c = normaliseFormsConfig({ ...config, fields: config.fields.map((f) => (f.system ? f : { ...f, archived: true })) });
    expect(submissionProblems(c, survey)).toEqual([]);
  });

  test('the default configuration never blocks a submission', () => {
    expect(submissionProblems(normaliseFormsConfig({}), { facility: {}, items: [{}, {}] })).toEqual([]);
  });
});
