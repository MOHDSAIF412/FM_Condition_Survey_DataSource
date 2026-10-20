import { test, expect, vi } from 'vitest';
import { createMeterMapping, createMeter, meterCosts, meterData, costTotals, reviewChecks, changeMeterState, isDeletedMapping, isMeter, nextMappingNo } from '../meter/model';
import { isConditionSurvey, isDeletedRecord } from '../utils/modules';
import { createQhse } from '../qhse/model';
import { createNewSurvey } from '../types/survey';
import { backTarget } from '../utils/backNavigation';
import { mergeSurveyLists } from '../utils/surveySelection';
vi.mock('../utils/fileSaver', () => ({ saveBlob: vi.fn() }));
const { generateMeterPDF, generateMeterExcel } = await import('../meter/reports');
const ExcelJS = (await import('exceljs')).default;
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

// The two rows of the meter mapping spreadsheet the module was built from.
function fixture() {
  const s = createMeterMapping('project-1', 1, { name: 'Malls' });
  s.facility.meter = { ...s.facility.meter, branch: 'MBZ12', region: 'Abu Dhabi', readingDate: '2026-04-17' };
  const a = createMeter(0), b = createMeter(1);
  a.customValues = { ...a.customValues, tenant: 'ADCOOP Market', shopLocation: 'GROUND FLOOR', subLocation: 'GROUND FLOOR', feedFrom: 'ADCOOP',
    loadVerification: 'All load is connected to Market DB', meterNumber: 'I1C17D002162', shopSize: '1250', powerLoad: '574',
    dbOfSupply: 'MDB', breakerSize: '800 A', cableSize: '240 Sqmm', meterType: 'CT', meterStatus: 'Active', sldAvailable: 'Yes', acSystem: 'Building AC', kwhReading: '3204670', remarks: 'N/A' };
  b.customValues = { ...b.customValues, tenant: 'Lamazani Smoking Supplies', shopLocation: 'GROUND FLOOR', subLocation: 'Outside ADCOOP', feedFrom: 'Mall',
    meterNumber: 'ISK25E3D96892668', shopSize: '28.87', powerLoad: '3.5', meterType: 'Direct', meterStatus: 'Active', kwhReading: '3804', operatingHours: '12' };
  b.photos = [{ id: 'ph1', dataUrl: photo, caption: 'Meter face' }];
  s.items = [a, b];
  return s;
}

test('costs follow the spreadsheet formula and use the mapping defaults unless a meter overrides them', () => {
  const s = fixture();
  // 574 kW × 0.8 × 16 h × 30 × 0.2 AED, as in the sheet's =L2*N2*M2*30*O2.
  expect(meterCosts(s, s.items[0])).toEqual({ monthly: 44083.2, annual: 528998.4 });
  // Meter 2 sets 12 hours of its own.
  expect(meterCosts(s, s.items[1])).toEqual({ monthly: 201.6, annual: 2419.2 });
  expect(meterData(s, s.items[1]).operatingHours).toBe('12');
  expect(costTotals(s)).toEqual({ monthly: 44284.8, annual: 531417.6 });
  expect(meterCosts(s, createMeter(3))).toEqual({ monthly: null, annual: null });
});

test('mapping numbers continue from the highest used, including the spreadsheet\'s 0', () => {
  expect(nextMappingNo([])).toBe(1);
  expect(nextMappingNo(fixture().items)).toBe(2);
});

test('submission requires property name, region, a meter, tenant and meter number; delete and restore keep the data', () => {
  const blank = createMeterMapping('p');
  expect(() => changeMeterState(blank, 'submit')).toThrow('Enter property name.');
  const s = fixture();
  expect(reviewChecks(s).filter(c => c.blocking)).toEqual([]);
  expect(reviewChecks(s).map(c => c.message)).toContain('Meter 1: add a meter reference photo.');
  const submitted = changeMeterState(s, 'submit', '2026-10-13T10:00:00Z');
  expect(submitted.status).toBe('submitted');
  const deleted = changeMeterState(submitted, 'delete');
  expect(isDeletedMapping(deleted)).toBe(true); expect(isDeletedRecord(deleted)).toBe(true);
  expect(deleted.items).toEqual(submitted.items);
  expect(changeMeterState(deleted, 'restore')).toEqual(submitted);
  expect(() => changeMeterState({ ...submitted, reviewStatus: 'approved' }, 'delete')).toThrow('Reopen');
});

test('meter mappings stay out of Condition Survey and QHSE', () => {
  const meter = fixture(), qhse = createQhse('p'), condition = createNewSurvey(1);
  expect(isMeter(meter)).toBe(true);
  expect([meter, qhse, condition, { facility: {} }].map(isConditionSurvey)).toEqual([false, false, true, true]);
  // A blank new mapping still lists, as a blank QHSE inspection does.
  const merged = mergeSurveyLists([], [{ ...createMeterMapping('p'), pendingSync: true }]);
  expect(merged).toHaveLength(1);
});

test('back navigation returns to the meter hub', () => {
  expect(backTarget({ view: 'survey', hub: 'meter', hasProject: true })).toEqual({ view: 'meter', label: 'Project meter mappings' });
  expect(backTarget({ view: 'meter' }).view).toBe('projects');
  expect(backTarget({ view: 'reports', hub: 'meter', hasProject: true }).view).toBe('meter');
  expect(backTarget({ view: 'survey', qhse: true, hasProject: true }).view).toBe('qhse');
});

test('PDF and Excel exports carry every meter in the spreadsheet column order with live cost formulas', async () => {
  vi.stubGlobal('Image', class { naturalWidth = 1; naturalHeight = 1; set src(v) { queueMicrotask(() => this.onload()); } });
  try {
    const s = fixture();
    const pdf = await generateMeterPDF(s, { returnBlob: true });
    expect(pdf.size).toBeGreaterThan(1000);
    const xlsx = await generateMeterExcel(s, { returnBlob: true });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await xlsx.arrayBuffer());
    const sheet = wb.getWorksheet('Meters 1');
    const head = sheet.getRow(1).values.slice(1);
    expect(head.slice(0, 4)).toEqual(['Property name', 'Region', 'Mapping No.', 'Tenant']);
    expect(head.indexOf('kWh Reading')).toBe(head.indexOf('Meter Reference Photo') - 1);
    expect(head.at(-1)).toBe('Other Remarks');
    const row = sheet.getRow(2).values.slice(1);
    expect(row[0]).toBe('MBZ12'); expect(row[3]).toBe('ADCOOP Market');
    const monthly = sheet.getRow(2).getCell(3 + head.slice(2).indexOf('Est. monthly cost (AED)'));
    expect(monthly.value.formula).toMatch(/\*30\*/); expect(monthly.value.result).toBe(44083.2);
    expect(sheet.getImages()).toHaveLength(1);
    expect(sheet.getRow(2).getCell(head.indexOf('Meter Reference Photo') + 1).value).toBe('No photo');
  } finally { vi.unstubAllGlobals(); }
});
