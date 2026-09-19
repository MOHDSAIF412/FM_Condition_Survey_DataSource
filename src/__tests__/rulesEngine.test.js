import { describe, test, expect } from 'vitest';
import { normaliseFormsConfig, validateFormsConfig } from '../config/formConfig';
import { evaluateRules, fieldState, missingRequired, submissionProblems, conditionMatches, describeRule, valueOptions, operatorsFor } from '../config/rulesEngine';

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

describe('the rules editor helpers', () => {

  test('built-in dropdowns offer their names and store their ids', () => {
    expect(valueOptions(config, 'snag', 'priority')[0]).toEqual({ value: '1', label: 'Priority 1 (Urgent)' });
    expect(valueOptions(config, 'snag', 'department').some((o) => o.value === 'HVAC')).toBe(true);
    expect(valueOptions(config, 'snag', 'condition').map((o) => o.label)).toEqual(['Good', 'Critical']);
    expect(valueOptions(config, 'snag', 'defectDescription')).toBeNull();
  });

  test('a priority rule chosen in the builder fires on a real snag', () => {
    const rule = { id: 'p1', scope: 'snag', conditions: [{ fieldKey: 'priority', op: 'equals', value: '1' }], actions: [{ type: 'require', fieldKey: 'photos' }] };
    expect(evaluateRules([rule], 'snag', { priority: 1 }).fired).toEqual(['p1']);
    expect(evaluateRules([rule], 'snag', { priority: 2 }).fired).toEqual([]);
    const any = { ...rule, conditions: [{ fieldKey: 'priority', op: 'any_of', value: ['1', '2'] }] };
    expect(evaluateRules([any], 'snag', { priority: 2 }).fired).toEqual(['p1']);
  });

  test('photos can only be checked for empty / not empty', () => {
    expect(operatorsFor(config, 'snag', 'photos')).toEqual(['is_empty', 'is_not_empty']);
  });

  test('reads as a sentence with option names, not stored values', () => {
    expect(describeRule(config.rules[0], config)).toBe('IF Condition is Critical THEN show Defect, show Recommendation, make Photos required');
  });

  test('a condition with no value, or hiding an always-shown field, cannot be saved', () => {
    const bad = normaliseFormsConfig({
      ...config,
      rules: [{ id: 'x', name: 'Bad', scope: 'snag', conditions: [{ fieldKey: 'condition', op: 'equals', value: '' }], actions: [{ type: 'hide', fieldKey: 'priority' }] }]
    });
    const problems = validateFormsConfig(bad).join(' ');
    expect(problems).toMatch(/Bad: an IF condition has no value/);
    expect(problems).toMatch(/Bad hides a field the app always shows/);
  });
});
