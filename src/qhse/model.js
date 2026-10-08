import { createNewSurvey, createDefaultAsset } from '../types/survey';

export const BRAND = { blue: '293771', orange: 'F15F22', red: 'B91C2A', green: '00AE4D', grey: '4D4D4F' };
export const SEVERITIES = ['Critical -2', 'Moderate', 'No Impact'];
export const TYPES = ['Safety', 'Equipment', 'Housekeeping', 'Quality', 'Pest control Service', 'Environment', 'Health'];
export const isQhse = (survey) => survey?.facility?.module === 'qhse';
export function createQhse(projectId = null, number = 1, project = {}, template = null) {
  const survey = createNewSurvey(number);
  return { ...survey, title: 'QHSE Site Inspection Report', projectId, items: [],
    facility: { ...survey.facility, facilityName: project.name || '', address: project.location || '', module: 'qhse', scopeNotes: '', qhse: {
      projectName: project.name || '', auditTitle: 'QHSE Site Inspection Report', reportNumber: '', region: '', site: '',
      layout: template ? structuredClone(template) : { hidden: [], custom: [] },
      conductedOn: '', personnel: '', summary: ''
    } } };
}
export function createFinding() {
  return { ...createDefaultAsset('', 'GENERAL'), customValues: { qhseType: '', severity: '', cafmReference: '', findingStatus: 'Open' } };
}
export function findingData(item) {
  return { location: item.location || '', description: item.defectDescription || '',
    type: item.customValues?.qhseType || '', severity: item.customValues?.severity || '',
    cafmReference: item.customValues?.cafmReference || '', status: item.customValues?.findingStatus || 'Open', photos: item.photos || [] };
}
export function riskColor(severity) {
  return severity === 'Critical -2' ? BRAND.red : severity === 'Moderate' ? BRAND.orange : severity === 'No Impact' ? BRAND.green : BRAND.grey;
}
export function reportDetails(survey) {
  const f = survey.facility || {}, q = f.qhse || {};
  return [['Project name', q.projectName || f.facilityName], ...activeFields(survey, 'inspection').map(field => [field.label, inspectionValue(survey, field)])];
}
export const INSPECTION_FIELDS = [
  { id: 'auditTitle', label: 'Audit title' }, { id: 'reportNumber', label: 'Report number' },
  { id: 'address', label: 'Location / address', required: true }, { id: 'conductedOn', label: 'Conducted on', type: 'datetime-local' },
  { id: 'surveyorName', label: 'Prepared by' }, { id: 'personnel', label: 'Personnel', type: 'textarea' },
  { id: 'summary', label: 'Inspection summary', type: 'textarea' }
];
export const FINDING_FIELDS = [
  { id: 'location', label: 'Location', required: true }, { id: 'type', label: 'Type', required: true },
  { id: 'description', label: 'Description', type: 'textarea', required: true },
  { id: 'severity', label: 'Severity', required: true }, { id: 'cafmReference', label: 'CAFM reference' }, { id: 'status', label: 'Status' }
];
export function activeFields(survey, scope) {
  const layout = survey.facility?.qhse?.layout || {};
  return [...(scope === 'inspection' ? INSPECTION_FIELDS : FINDING_FIELDS), ...(layout.custom || []).filter(f => f.scope === scope)]
    .filter(f => !(layout.hidden || []).includes(`${scope}:${f.id}`));
}
export function inspectionValue(survey, field) {
  const f = survey.facility || {}, q = f.qhse || {};
  return field.custom ? q.customValues?.[field.id] || '' : ['address', 'surveyorName'].includes(field.id) ? f[field.id] || '' : q[field.id] || '';
}
export function findingDetails(survey, item) {
  const data = findingData(item);
  return activeFields(survey, 'finding').map(f => [f.label, f.custom ? item.customValues?.[f.id] || '' : data[f.id] || '']);
}
export function inspectionIssues(survey) {
  const issues = [];
  if (!survey.facility?.qhse?.projectName?.trim()) issues.push('Enter the project name.');
  for (const field of activeFields(survey, 'inspection').filter(f => f.required)) {
    if (!String(inspectionValue(survey, field)).trim()) issues.push(`Enter ${field.label.toLowerCase()}.`);
  }
  for (const [index, item] of (survey.items || []).entries()) {
    const f = findingData(item);
    for (const key of activeFields(survey, 'finding').filter(f => f.required).map(f => f.id)) {
      if (!f[key]?.trim()) issues.push(`Finding ${index + 1}: enter ${key}.`);
    }
  }
  return issues;
}
