import { isDeletedInspection } from '../qhse/lifecycle';
import { isDeletedMapping } from '../meter/model';

// Every record lives in condition_surveys; facility.module says which work
// module owns it. Records written before modules existed carry no module and
// are Condition Survey facilities.
export const moduleOf = (survey) => survey?.facility?.module || 'condition';
export const isConditionSurvey = (survey) => moduleOf(survey) === 'condition';

export const MODULE_LABELS = {
  condition: { name: 'Condition Survey', record: 'facility', records: 'facilities', items: 'Snags' },
  qhse: { name: 'QHSE Inspection', record: 'inspection', records: 'inspections', items: 'Findings' },
  meter: { name: 'Meter Mapping', record: 'mapping', records: 'mappings', items: 'Meters' }
};
export const moduleLabels = (module) => MODULE_LABELS[module] || MODULE_LABELS.condition;

// QHSE inspections and meter mappings are soft-deleted (kept, flagged).
export const isDeletedRecord = (survey) => isDeletedInspection(survey) || isDeletedMapping(survey);
