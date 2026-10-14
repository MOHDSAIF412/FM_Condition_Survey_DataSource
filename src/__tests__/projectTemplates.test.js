import { test, expect, vi } from 'vitest';
import { standardProjectTemplate, projectTemplateCopy, toggleTemplateField, addTemplateField, attachProjectTemplate, recordFormsConfig, templatesForModule } from '../utils/projectTemplates';
import { defaultFormsConfig } from '../config/formConfig';
import { createQhse, activeFields, reportDetails as qhseDetails } from '../qhse/model';
import { createMeterMapping, createMeter, activeMeterFields, meterData, reportDetails } from '../meter/model';
import { createNewSurvey } from '../types/survey';
import { reportFieldsFor } from '../config/reportFields';
import { templatesForType } from '../utils/templates';
vi.mock('../utils/fileSaver', () => ({ saveBlob: vi.fn() }));

test('project edits do not mutate standards or another project and cannot mix modules', () => {
  for (const module of ['condition', 'qhse', 'meter']) {
    const standard = standardProjectTemplate(module);
    const before = JSON.stringify(standard);
    const first = projectTemplateCopy(standard, module);
    const second = projectTemplateCopy(standard, module);
    const optional = module === 'condition' ? 'sys_facility_scopeNotes' : module === 'qhse' ? 'inspection:personnel' : 'meter:shopLocation';
    const changed = toggleTemplateField(first, optional, false);
    expect(JSON.stringify(changed)).not.toEqual(before);
    expect(JSON.stringify(second)).toEqual(before);
    expect(JSON.stringify(standard)).toEqual(before);
    expect(() => projectTemplateCopy(standard, module === 'qhse' ? 'meter' : 'qhse')).toThrow(/module/);
  }
});

test('required fields and formula inputs cannot be disabled in project creation', () => {
  const meter = standardProjectTemplate('meter');
  for (const id of ['header:branch', 'meter:tenant', 'meter:powerLoad', 'meter:monthlyCost']) expect(toggleTemplateField(meter, id, false)).toBe(meter);
  const qhse = projectTemplateCopy({ ...standardProjectTemplate('qhse'), fieldLayout: { hidden: ['inspection:address', 'finding:description'], custom: [] } }, 'qhse');
  expect(qhse.fieldLayout.hidden).toEqual([]);
});

test('saved templates remain module-specific; layout-only templates do not enter facility checklist pickers', () => {
  const templates = [standardProjectTemplate('condition'), standardProjectTemplate('qhse'), standardProjectTemplate('meter'), { id: 'check', name: 'Checklist', items: [{description:'Inspect doors'}] }];
  expect(templatesForModule(templates, 'meter').map(t => t.module)).toEqual(['meter']);
  expect(templatesForType(templates).map(t => t.id)).toEqual(['check']);
});

test('Condition records carry their own form snapshot and custom report fields', () => {
  const config = defaultFormsConfig();
  let template = addTemplateField(standardProjectTemplate('condition', config), { label: 'Asset tag', scope: 'snag' });
  template = toggleTemplateField(template, 'sys_facility_scopeNotes', false);
  const record = attachProjectTemplate(createNewSurvey(), { reportTemplate: template });
  const snapshot = recordFormsConfig(record, config);
  expect(snapshot.fields.find(f => f.key === 'scopeNotes').hidden).toBe(true);
  expect(reportFieldsFor('snag', 'pdf', [], snapshot).map(f => f.label)).toContain('Asset tag');
  template.fieldLayout.formsConfig.fields = [];
  expect(snapshot.fields.length).toBeGreaterThan(0);
  expect(recordFormsConfig(createNewSurvey(), config)).toBe(config);
});

test('QHSE project default initializes hidden/custom fields without copying report answers', () => {
  let template = toggleTemplateField(standardProjectTemplate('qhse'), 'inspection:personnel', false);
  template = addTemplateField(template, { label: 'Permit reference', scope: 'inspection' });
  const record = createQhse('p', 1, { name: 'Site', reportTemplate: template });
  expect(activeFields(record, 'inspection').map(f => f.id)).not.toContain('personnel');
  expect(qhseDetails(record).map(([label]) => label)).toContain('Permit reference');
  expect(record.facility.qhse.conductedOn).toBe('');
  expect(record.items).toEqual([]);
  record.facility.qhse.layout.hidden.push('inspection:summary');
  expect(template.fieldLayout.hidden).not.toContain('inspection:summary');
});

test('Meter project layout works in forms and Excel while preserving standard column order and formulas', async () => {
  let template = toggleTemplateField(standardProjectTemplate('meter'), 'meter:shopLocation', false);
  template = addTemplateField(template, { label: 'Panel reference', scope: 'meter' });
  template = addTemplateField(template, { label: 'Site contact', scope: 'header' });
  const record = createMeterMapping('p', 1, { reportTemplate: template });
  const custom = template.fieldLayout.custom.find(f => f.scope === 'meter');
  const contact = template.fieldLayout.custom.find(f => f.scope === 'header');
  record.facility.meter[contact.id] = 'Operations';
  const meter = createMeter(1);
  meter.customValues = { ...meter.customValues, tenant: 'Tenant', meterNumber: '123', powerLoad: '10', shopLocation: 'Retained', [custom.id]: 'DB-17' };
  record.items = [meter];
  expect(activeMeterFields(record, 'meter').map(f => f.id)).not.toContain('shopLocation');
  expect(meterData(record, meter)[custom.id]).toBe('DB-17');
  expect(reportDetails(record)).toContainEqual(['Site contact', 'Operations']);
  const { generateMeterExcel } = await import('../meter/reports');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await (await generateMeterExcel(record, { returnBlob: true })).arrayBuffer());
  const ws = wb.getWorksheet('Meters 1');
  expect(ws.getColumn(5).hidden).toBe(true);
  expect(ws.getCell('E2').value).toBe('Retained');
  expect(ws.getCell('AD1').value).toBe('Panel reference');
  expect(ws.getCell('AD2').value).toBe('DB-17');
  expect(ws.getCell('P2').value.formula).toBe('L2*N2*M2*30*O2');
});
