import { createNewSurvey, createDefaultAsset } from '../types/survey';

export const BRAND = { blue: '293771', orange: 'F15F22', red: 'B91C2A', green: '00AE4D', grey: '4D4D4F' };
export const SEVERITIES = ['Critical -2', 'Moderate', 'No Impact'];
export const TYPES = ['Safety', 'Equipment', 'Housekeeping', 'Quality', 'Pest control Service', 'Environment', 'Health'];
export const isQhse = (survey) => survey?.facility?.module === 'qhse';
export function createQhse(projectId = null, number = 1) {
  const survey = createNewSurvey(number);
  return { ...survey, title: 'QHSE Site Inspection Report', projectId, items: [],
    facility: { ...survey.facility, module: 'qhse', scopeNotes: '', qhse: {
      projectName: '', auditTitle: 'QHSE Site Inspection Report', reportNumber: '', region: '', site: '',
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
  return [['Project name', q.projectName], ['Audit title', q.auditTitle], ['Report number', q.reportNumber],
    ['Region', q.region], ['Site', q.site], ['Location', f.address], ['Conducted on', q.conductedOn],
    ['Prepared by', f.surveyorName], ['Personnel', q.personnel]];
}
export function inspectionIssues(survey) {
  const issues = [];
  if (!survey.facility?.qhse?.projectName?.trim()) issues.push('Enter the project name.');
  if (!survey.facility?.address?.trim()) issues.push('Enter the inspection location.');
  for (const [index, item] of (survey.items || []).entries()) {
    const f = findingData(item);
    for (const key of ['location', 'type', 'description', 'severity']) {
      if (!f[key]?.trim()) issues.push(`Finding ${index + 1}: enter ${key}.`);
    }
  }
  return issues;
}
