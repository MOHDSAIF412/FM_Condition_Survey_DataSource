import { createNewSurvey, createDefaultAsset } from '../types/survey';
import { isLocked } from '../utils/workflow';

// Meter Mapping shares storage with the other modules: one condition_surveys
// row per branch mapping (facility.module = 'meter'), one survey_items row per
// meter with its fields in custom_values. No database change is needed.
export const isMeter = (survey) => survey?.facility?.module === 'meter';
export const isDeletedMapping = (survey) => isMeter(survey) && !!survey.facility?.meter?.deletedAt;

export const METER_TYPES = ['CT', 'Direct'];
export const METER_STATUSES = ['Active', 'Inactive', 'Faulty', 'Not found'];
export const YES_NO = ['Yes', 'No'];
export const AC_SYSTEMS = ['Building AC', 'Independent'];

/** Header defaults the spreadsheet repeated on every row. */
export const DEFAULTS = { tariff: '0.2', operatingHours: '16', diversityFactor: '0.8' };

export const HEADER_FIELDS = [
  { id: 'branch', label: 'Branch', required: true },
  { id: 'region', label: 'Region', required: true },
  { id: 'readingDate', label: 'kWh reading date', type: 'date' },
  { id: 'tariff', label: 'Default tariff rate (AED/kWh)', type: 'number' },
  { id: 'operatingHours', label: 'Default daily operating hours', type: 'number' },
  { id: 'diversityFactor', label: 'Default diversity factor', type: 'number' },
  { id: 'surveyorName', label: 'Prepared by' },
  { id: 'summary', label: 'Summary', type: 'textarea' }
];

// Same order as the source spreadsheet, so the Excel export lines up with it.
export const METER_FIELDS = [
  { id: 'mappingNo', label: 'Mapping No.', type: 'number' },
  { id: 'tenant', label: 'Tenant', required: true },
  { id: 'shopLocation', label: 'Shop location' },
  { id: 'subLocation', label: 'Sub location' },
  { id: 'feedFrom', label: 'Feed from' },
  { id: 'loadVerification', label: 'Verification of load connection', type: 'textarea' },
  { id: 'meterNumber', label: 'kWh meter number', required: true },
  { id: 'invoicePrice', label: 'Invoice price (AED, finance reference)', type: 'number' },
  { id: 'shopSize', label: 'Estimated shop size (m²)', type: 'number' },
  { id: 'powerLoad', label: 'Estimated power load (kW)', type: 'number' },
  { id: 'operatingHours', label: 'Daily operating hours', type: 'number', inherits: true },
  { id: 'diversityFactor', label: 'Diversity factor', type: 'number', inherits: true },
  { id: 'tariff', label: 'Tariff rate (AED/kWh)', type: 'number', inherits: true },
  { id: 'monthlyCost', label: 'Est. monthly cost (AED)', calculated: true },
  { id: 'annualCost', label: 'Est. annual cost (AED)', calculated: true },
  { id: 'dbOfSupply', label: 'DB of supply' },
  { id: 'breakerSize', label: 'Breaker size' },
  { id: 'cableSize', label: 'Cable size' },
  { id: 'meterType', label: 'Meter type & rating', options: METER_TYPES },
  { id: 'meterStatus', label: 'Meter status', options: METER_STATUSES },
  { id: 'sldAvailable', label: 'Approved SLD & load schedule available', options: YES_NO },
  { id: 'acSystem', label: 'Tenant AC system', options: AC_SYSTEMS },
  { id: 'acJustification', label: 'Justification of tenant AC system', type: 'textarea' },
  { id: 'kwhReading', label: 'kWh reading', type: 'number' },
  { id: 'remarks', label: 'Remarks', type: 'textarea' },
  { id: 'otherRemarks', label: 'Other remarks', type: 'textarea' }
];

export function createMeterMapping(projectId = null, number = 1, project = {}) {
  const survey = createNewSurvey(number);
  return { ...survey, title: 'Meter Mapping Report', projectId, items: [],
    facility: { ...survey.facility, facilityName: project.name || '', address: project.location || '', module: 'meter', scopeNotes: '',
      meter: { branch: '', region: '', readingDate: '', summary: '', ...DEFAULTS } } };
}

export function createMeter(mappingNo = '') {
  return { ...createDefaultAsset('', 'ELECTRICAL'), customValues: { meter: true, mappingNo: mappingNo === '' ? '' : String(mappingNo) } };
}

/** Next mapping number: one past the highest already used. */
export function nextMappingNo(items = []) {
  const used = items.map(i => Number(i.customValues?.mappingNo)).filter(Number.isFinite);
  return used.length ? Math.max(...used) + 1 : 1;
}

const num = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;

/** A meter's own value, else the mapping's default for fields that inherit one. */
export function meterValue(survey, item, id) {
  const own = item.customValues?.[id];
  const field = METER_FIELDS.find(f => f.id === id);
  if (field?.inherits && (own === '' || own == null)) return survey.facility?.meter?.[id] ?? '';
  return own ?? '';
}

/** Monthly = kW × diversity × hours × 30 × tariff; annual = monthly × 12. Null when an input is missing. */
export function meterCosts(survey, item) {
  const load = num(meterValue(survey, item, 'powerLoad')), diversity = num(meterValue(survey, item, 'diversityFactor'));
  const hours = num(meterValue(survey, item, 'operatingHours')), tariff = num(meterValue(survey, item, 'tariff'));
  if ([load, diversity, hours, tariff].includes(null)) return { monthly: null, annual: null };
  const monthly = round2(load * diversity * hours * 30 * tariff);
  return { monthly, annual: round2(monthly * 12) };
}

export function meterData(survey, item) {
  const data = Object.fromEntries(METER_FIELDS.filter(f => !f.calculated).map(f => [f.id, meterValue(survey, item, f.id)]));
  const { monthly, annual } = meterCosts(survey, item);
  return { ...data, monthlyCost: monthly, annualCost: annual, photos: item.photos || [] };
}

export function costTotals(survey) {
  return (survey.items || []).reduce((t, item) => {
    const { monthly, annual } = meterCosts(survey, item);
    return { monthly: round2(t.monthly + (monthly || 0)), annual: round2(t.annual + (annual || 0)) };
  }, { monthly: 0, annual: 0 });
}

export function headerValue(survey, id) {
  return id === 'surveyorName' ? survey.facility?.surveyorName || '' : survey.facility?.meter?.[id] ?? '';
}

export function reportDetails(survey) {
  const f = survey.facility || {}, totals = costTotals(survey);
  return [['Project', f.facilityName], ...HEADER_FIELDS.map(field => [field.label, headerValue(survey, field.id)]),
    ['Meters mapped', String((survey.items || []).length)],
    ['Est. monthly cost total (AED)', totals.monthly.toFixed(2)], ['Est. annual cost total (AED)', totals.annual.toFixed(2)]];
}

export function reviewChecks(survey) {
  const checks = [];
  for (const field of HEADER_FIELDS.filter(f => f.required)) {
    if (!String(headerValue(survey, field.id)).trim()) checks.push({ message: `Enter ${field.label.toLowerCase()}.`, blocking: true, section: 'details', fieldId: field.id });
  }
  if (!(survey.items || []).length) checks.push({ message: 'Add at least one meter before submitting.', blocking: true, section: 'meters' });
  (survey.items || []).forEach((item, index) => {
    for (const field of METER_FIELDS.filter(f => f.required)) {
      if (!String(item.customValues?.[field.id] ?? '').trim()) checks.push({ message: `Meter ${index + 1}: enter ${field.label.toLowerCase()}.`, blocking: true, section: 'meters', itemId: item.id, fieldId: field.id });
    }
    if (!String(item.customValues?.kwhReading ?? '').trim()) checks.push({ message: `Meter ${index + 1}: record the kWh reading.`, section: 'meters', itemId: item.id, fieldId: 'kwhReading' });
    if (!(item.photos || []).length) checks.push({ message: `Meter ${index + 1}: add a meter reference photo.`, section: 'meters', itemId: item.id });
  });
  if (!survey.facility?.meter?.readingDate) checks.push({ message: 'Reading date is missing.', section: 'details', fieldId: 'readingDate' });
  if (!survey.signatures?.surveyor?.signatureData) checks.push({ message: 'Surveyor signature is missing.', section: 'review', signature: true });
  return checks;
}

export const blockingIssues = (survey) => reviewChecks(survey).filter(c => c.blocking).map(c => c.message);

export function changeMeterState(record, action, now = new Date().toISOString()) {
  if (!isMeter(record)) throw new Error('Select a meter mapping.');
  if (isLocked(record)) throw new Error('Reopen the approved mapping before changing it.');
  if (action === 'submit') {
    if (isDeletedMapping(record)) throw new Error('Restore this mapping before submitting it.');
    const issues = blockingIssues(record);
    if (issues.length) throw new Error(issues.join(' '));
    return { ...record, status: 'submitted', submittedAt: now };
  }
  if (!['delete', 'restore'].includes(action)) throw new Error('Unknown mapping action.');
  const meter = { ...record.facility.meter };
  if (action === 'delete') meter.deletedAt = now;
  else delete meter.deletedAt;
  return { ...record, facility: { ...record.facility, meter } };
}
