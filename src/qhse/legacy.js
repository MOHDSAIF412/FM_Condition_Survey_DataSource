import { isQhse } from './model';

// Require QHSE and inspection/report together. Generic FM inspections stay put.
export function isLegacyQhse(survey) {
  if (isQhse(survey)) return false;
  if (survey?.facility?.qhse) return true;
  return [survey?.title, survey?.facilityName, survey?.facility?.facilityName, survey?.facility?.buildingName]
    .some(value => /\bQHSE\b[\s\S]*\b(inspection|audit|report)\b|\b(inspection|audit|report)\b[\s\S]*\bQHSE\b/i.test(value || ''));
}

export function moveLegacyQhse(survey, project) {
  if (isQhse(survey)) return survey;
  if (!isLegacyQhse(survey)) throw new Error('This record does not have a QHSE inspection title.');
  const facility = survey.facility || {}, q = facility.qhse || {};
  return { ...survey, facility: { ...facility, module: 'qhse', facilityName: project?.name || q.projectName || facility.facilityName,
    qhse: { auditTitle: survey.title || 'QHSE Site Inspection Report', reportNumber: '', conductedOn: '', personnel: '', summary: '',
      layout: { hidden: [], custom: [] }, ...q, projectName: project?.name || q.projectName || facility.facilityName || '',
      migratedFrom: { title: survey.title, facility: structuredClone(facility), movedAt: new Date().toISOString() } }
  } };
}
