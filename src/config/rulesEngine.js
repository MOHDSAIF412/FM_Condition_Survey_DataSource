/**
 * IF / THEN rules, evaluated the same way on the web portal, in the phone app
 * and when checking a facility before it is submitted.
 *
 *   IF   Condition equals Critical
 *   THEN show Defect, show Recommendation, require Photo
 *
 * Rules run in the order they are listed; when two rules change the same field
 * the later one wins, so an administrator can always reason about the result
 * by reading the list top to bottom.
 *
 * Rules only change what is shown and what is required. They never change or
 * clear a value -- a field hidden by a rule keeps whatever was recorded in it.
 */
import { isEmptyValue } from './fieldTypes';
import { onPlatform, valuesForScope, sectionsForScope, fieldsForSection, activeOptions } from './formConfig';
import { PRIORITY_LEVELS, DEPARTMENTS, FACILITY_TYPES } from '../types/survey';

export const OPERATORS = {
  equals: { label: 'is', needsValue: true },
  not_equals: { label: 'is not', needsValue: true },
  any_of: { label: 'is any of', needsValue: true, multi: true },
  contains: { label: 'contains', needsValue: true },
  greater_than: { label: 'is greater than', needsValue: true },
  less_than: { label: 'is less than', needsValue: true },
  is_empty: { label: 'is empty', needsValue: false },
  is_not_empty: { label: 'is not empty', needsValue: false }
};

export const ACTIONS = {
  show: 'Show',
  hide: 'Hide',
  require: 'Make required',
  optional: 'Make optional'
};

const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

export function conditionMatches(condition, values = {}) {
  const actual = values[condition.fieldKey];
  const expected = condition.value;
  const list = Array.isArray(actual) ? actual.map(norm) : null;
  switch (condition.op) {
    case 'equals':
      return list ? list.length === 1 && list[0] === norm(String(expected)) : String(norm(actual ?? '')) === String(norm(expected ?? ''));
    case 'not_equals':
      return list ? !(list.length === 1 && list[0] === norm(String(expected))) : String(norm(actual ?? '')) !== String(norm(expected ?? ''));
    case 'any_of': {
      const wanted = (Array.isArray(expected) ? expected : String(expected).split(',')).map((x) => norm(String(x)));
      return list ? list.some((v) => wanted.includes(v)) : wanted.includes(String(norm(actual ?? '')));
    }
    case 'contains':
      return list ? list.includes(norm(String(expected))) : String(norm(actual ?? '')).includes(String(norm(expected ?? '')));
    case 'greater_than':
      return actual !== '' && actual != null && Number(actual) > Number(expected);
    case 'less_than':
      return actual !== '' && actual != null && Number(actual) < Number(expected);
    case 'is_empty':
      return isEmptyValue(list ? 'multiselect' : 'text', actual);
    case 'is_not_empty':
      return !isEmptyValue(list ? 'multiselect' : 'text', actual);
    default:
      return false;
  }
}

/**
 * @returns {{ visible: Object<string, boolean>, required: Object<string, boolean>, fired: string[] }}
 *   Only fields a rule touched appear in `visible` / `required`.
 */
export function evaluateRules(rules = [], scope, values = {}) {
  const visible = {};
  const required = {};
  const fired = [];
  for (const rule of rules) {
    if (!rule || rule.archived || rule.enabled === false || rule.scope !== scope) continue;
    if (!rule.conditions?.length || !rule.actions?.length) continue;
    const results = rule.conditions.map((c) => conditionMatches(c, values));
    const matched = rule.match === 'any' ? results.some(Boolean) : results.every(Boolean);
    if (!matched) continue;
    fired.push(rule.id);
    for (const a of rule.actions) {
      if (a.type === 'show') visible[a.fieldKey] = true;
      else if (a.type === 'hide') visible[a.fieldKey] = false;
      else if (a.type === 'require') required[a.fieldKey] = true;
      else if (a.type === 'optional') required[a.fieldKey] = false;
    }
  }
  return { visible, required, fired };
}

/** Final on-screen state of one field: configuration first, then rules. */
export function fieldState(field, ruleResult, platform = 'web') {
  if (!onPlatform(field, platform)) return { visible: false, required: false };
  const byRule = ruleResult?.visible?.[field.key];
  const visible = field.lockVisible ? true : byRule !== undefined ? byRule : !field.hidden;
  const reqByRule = ruleResult?.required?.[field.key];
  const required = visible && (reqByRule !== undefined ? reqByRule : !!field.required);
  return { visible, required };
}

/**
 * Required fields left empty on one facility or snag, as labels. Built-in
 * fields are not checked here: they already have their own handling.
 */
export function missingRequired(config, scope, record, platform = 'web') {
  const values = valuesForScope(scope, record);
  const ruleResult = evaluateRules(config?.rules, scope, values);
  const missing = [];
  // In form order, so the list reads the way the surveyor sees the screen.
  const ordered = sectionsForScope(config, scope).flatMap((s) => fieldsForSection(config, s.id));
  for (const field of ordered) {
    const { visible, required } = fieldState(field, ruleResult, platform);
    if (!visible || !required) continue;
    // Built-ins are only checked when a rule makes them required (e.g. photos).
    if (field.system && ruleResult.required[field.key] !== true) continue;
    const type = field.key === 'photos' ? 'multiselect' : field.type;
    if (isEmptyValue(type, values[field.key])) missing.push(field.label);
  }
  return missing;
}

/**
 * Everything preventing a facility from being submitted, in readable lines.
 * Submitting is where "required" is enforced -- never while saving, so a
 * surveyor with no signal or an unfinished snag never loses work.
 */
export function submissionProblems(config, survey, platform = 'web') {
  if (!config) return [];
  const problems = [];
  const facilityMissing = missingRequired(config, 'facility', survey?.facility || {}, platform);
  if (facilityMissing.length) problems.push(`Facility: ${facilityMissing.join(', ')}`);
  (survey?.items || []).forEach((item, i) => {
    const missing = missingRequired(config, 'snag', item, platform);
    if (missing.length) {
      const where = (item.location || '').trim() ? ` (${item.location.trim()})` : '';
      problems.push(`Snag #${i + 1}${where}: ${missing.join(', ')}`);
    }
  });
  return problems;
}

/**
 * The choices a condition can compare a field with, or null for free text.
 * Built-in dropdowns store ids (priority 1-4, department and facility type
 * ids), so the builder offers their names and stores the ids -- typing the
 * wrong spelling is how a rule silently never fires.
 */
export function valueOptions(config, scope, fieldKey) {
  const field = (config?.fields || []).find((f) => f.scope === scope && f.key === fieldKey);
  if (!field) return null;
  if (field.system) {
    if (scope === 'snag' && fieldKey === 'priority') {
      return Object.values(PRIORITY_LEVELS).map((p) => ({ value: String(p.level), label: p.label }));
    }
    if (scope === 'snag' && fieldKey === 'department') {
      return Object.values(DEPARTMENTS).map((d) => ({ value: d.id, label: d.name }));
    }
    if (scope === 'facility' && fieldKey === 'facilityType') {
      return Object.values(FACILITY_TYPES).map((t) => ({ value: t.id, label: t.name }));
    }
    return null;
  }
  // An unticked box is usually never set at all, so "is not Ticked" is the reliable test.
  if (field.type === 'checkbox') return [{ value: 'true', label: 'Ticked' }];
  if (field.type === 'yesno') return [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  if (field.type === 'rating') return [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
  if (field.options?.length) {
    return activeOptions(field).map((o) => ({ value: o.value, label: o.label }));
  }
  return null;
}

/** Which operators make sense for a field. */
export function operatorsFor(config, scope, fieldKey) {
  const field = (config?.fields || []).find((f) => f.scope === scope && f.key === fieldKey);
  const type = field?.key === 'photos' ? 'photo' : field?.type;
  if (type === 'photo') return ['is_empty', 'is_not_empty'];
  if (['number', 'rating'].includes(type) || fieldKey === 'priority') {
    return ['equals', 'not_equals', 'any_of', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'];
  }
  if (['dropdown', 'checkbox', 'yesno'].includes(type)) return ['equals', 'not_equals', 'any_of', 'is_empty', 'is_not_empty'];
  if (type === 'multiselect') return ['contains', 'any_of', 'is_empty', 'is_not_empty'];
  return ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'];
}

/** A rule as one readable sentence: "IF Priority is Priority 1 (Urgent) THEN make Photos required". */
export function describeRule(rule, config) {
  const label = (key) => (config?.fields || []).find((f) => f.scope === rule.scope && f.key === key)?.label || key || '(no field)';
  const valueText = (c) => {
    const opts = valueOptions(config, rule.scope, c.fieldKey);
    const one = (v) => opts?.find((o) => String(o.value) === String(v))?.label ?? String(v);
    const list = Array.isArray(c.value) ? c.value : String(c.value ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    return c.op === 'any_of' ? list.map(one).join(' or ') : one(c.value ?? '');
  };
  const conds = (rule.conditions || []).map((c) => {
    const op = OPERATORS[c.op] || OPERATORS.equals;
    return op.needsValue ? `${label(c.fieldKey)} ${op.label} ${valueText(c)}` : `${label(c.fieldKey)} ${op.label}`;
  });
  const acts = (rule.actions || []).map((a) => (a.type === 'require' || a.type === 'optional'
    ? `make ${label(a.fieldKey)} ${a.type === 'require' ? 'required' : 'optional'}`
    : `${a.type} ${label(a.fieldKey)}`));
  return `IF ${conds.join(rule.match === 'any' ? ' OR ' : ' AND ') || '…'} THEN ${acts.join(', ') || '…'}`;
}
