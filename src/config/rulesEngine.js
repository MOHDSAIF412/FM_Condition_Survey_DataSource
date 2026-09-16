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
import { onPlatform, valuesForScope, sectionsForScope, fieldsForSection } from './formConfig';

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
