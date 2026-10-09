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
export function createPhotoEvidence(photos = [], location = '') {
  const item = createFinding();
  return { ...item, location, defectDescription: 'Report photo evidence', photos,
    customValues: { ...item.customValues, qhseEvidenceOnly: true } };
}
export function findingData(item) {
  return { location: item.location || '', description: item.defectDescription || '',
    type: item.customValues?.qhseType || '', severity: item.customValues?.severity || '',
    cafmReference: item.customValues?.cafmReference || '', status: item.customValues?.findingStatus || 'Open',
    actionOwner: item.customValues?.actionOwner || '', dueDate: item.customValues?.dueDate || '',
    closureRemarks: item.customValues?.closureRemarks || '', closedOn: item.customValues?.closedOn || '', photos: item.photos || [] };
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
  { id: 'severity', label: 'Severity', required: true }, { id: 'cafmReference', label: 'CAFM reference' }, { id: 'status', label: 'Status' },
  { id: 'actionOwner', label: 'Action owner' }, { id: 'dueDate', label: 'Action due date', type: 'date' },
  { id: 'closureRemarks', label: 'Closure remarks', type: 'textarea' }, { id: 'closedOn', label: 'Closed on', type: 'date' }
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
  return reportFindingFields(survey).map(f => [f.label, f.custom ? item.customValues?.[f.id] || '' : data[f.id] || '']);
}
export function reportFindingFields(survey) {
  const optionalActions = ['actionOwner', 'dueDate', 'closureRemarks', 'closedOn'];
  return activeFields(survey, 'finding').filter(field => !optionalActions.includes(field.id)
    || (survey.items || []).some(item => !item.customValues?.qhseEvidenceOnly && findingData(item)[field.id]));
}
export function inspectionIssues(survey) {
  const issues = [];
  if (!survey.facility?.qhse?.projectName?.trim()) issues.push('Enter the project name.');
  for (const field of activeFields(survey, 'inspection').filter(f => f.required)) {
    if (!String(inspectionValue(survey, field)).trim()) issues.push(`Enter ${field.label.toLowerCase()}.`);
  }
  for (const [index, item] of (survey.items || []).entries()) {
    if (item.customValues?.qhseEvidenceOnly) continue;
    const f = findingData(item);
    for (const key of activeFields(survey, 'finding').filter(f => f.required).map(f => f.id)) {
      const field = activeFields(survey, 'finding').find(field => field.id === key);
      const value = field.custom ? item.customValues?.[key] : f[key];
      if (!String(value ?? '').trim()) issues.push(`Finding ${index + 1}: enter ${key}.`);
    }
  }
  return issues;
}

export function reviewChecks(survey) {
  const checks = [];
  if (!survey.facility?.qhse?.projectName?.trim()) checks.push({ message: 'Enter the project name.', blocking: true, section: 'details' });
  for (const field of activeFields(survey, 'inspection').filter(f => f.required)) {
    if (!String(inspectionValue(survey, field)).trim()) checks.push({ message: `Enter ${field.label.toLowerCase()}.`, blocking: true, section: 'details', fieldId: field.id });
  }
  if (!(survey.items || []).some(i => i.photos?.length || (!i.customValues?.qhseEvidenceOnly && i.defectDescription?.trim())) && !survey.facility?.qhse?.summary?.trim())
    checks.push({ message: 'Add a finding, photo or inspection summary before submitting.', blocking: true, section: 'findings' });
  (survey.items || []).forEach((item, index) => {
    if (!item.customValues?.qhseEvidenceOnly) {
      const f = findingData(item);
      for (const field of activeFields(survey, 'finding').filter(f => f.required)) {
        const value = field.custom ? item.customValues?.[field.id] : f[field.id];
        if (!String(value ?? '').trim()) checks.push({ message: `Finding ${index + 1}: enter ${field.label.toLowerCase()}.`, blocking: true, section: 'findings', itemId: item.id, fieldId: field.id });
      }
      if (!f.actionOwner) checks.push({ message: `Finding ${index + 1}: assign an action owner.`, section: 'findings', itemId: item.id, fieldId: 'actionOwner' });
      if (f.status !== 'Closed' && !f.dueDate) checks.push({ message: `Finding ${index + 1}: set an action due date.`, section: 'findings', itemId: item.id, fieldId: 'dueDate' });
      if (f.status === 'Closed' && (!f.closureRemarks || !f.closedOn)) checks.push({ message: `Finding ${index + 1}: add closure remarks and closed date.`, section: 'findings', itemId: item.id });
    }
    (item.photos || []).forEach((photo, n) => {
      if (!photo.caption?.trim()) checks.push({ message: `Entry ${index + 1}, photo ${n + 1}: add a remark.`, section: 'findings', itemId: item.id, fieldId: `photo-${photo.id}` });
    });
  });
  if (!survey.signatures?.surveyor?.signatureData) checks.push({ message: 'Inspector signature is missing.', section: 'review', signature: true });
  if (!survey.facility?.qhse?.conductedOn) checks.push({ message: 'Inspection date is missing.', section: 'details', fieldId: 'conductedOn' });
  return checks;
}

export function actionSummary(items, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })) {
  const findings = (items || []).filter(i => !i.customValues?.qhseEvidenceOnly).map(findingData);
  return { open: findings.filter(f => f.status !== 'Closed').length,
    overdue: findings.filter(f => f.status !== 'Closed' && /^\d{4}-\d{2}-\d{2}$/.test(f.dueDate) && f.dueDate < today).length,
    critical: findings.filter(f => f.status !== 'Closed' && f.severity === 'Critical -2').length };
}
export function photoRemark(item, photo) {
  return `${item.customValues?.closurePhotoIds?.includes(photo?.id) ? 'Closure evidence: ' : ''}${photo?.caption || ''}`;
}
