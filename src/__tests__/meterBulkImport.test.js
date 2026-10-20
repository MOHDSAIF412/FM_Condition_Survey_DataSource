import { test, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { createMeterMapping, createMeter, meterCosts } from '../meter/model';
import { createMeterImportTemplate, readMeterImport, applyMeterImport, saveMeterImport } from '../meter/bulkImport';

function mapping() {
  const record = createMeterMapping('project-1');
  Object.assign(record.facility.meter, { branch: 'MBZ12', region: 'Abu Dhabi', readingDate: '2026-10-20' });
  return record;
}
async function workbook(record = mapping()) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await (await createMeterImportTemplate(record)).arrayBuffer());
  return book;
}
function add(book, values = {}) {
  const sheet = book.getWorksheet('Meters');
  const headers = sheet.getRow(1).values.slice(1);
  const rowNumber = Array.from({ length: 1000 }, (_, n) => n + 2).find(n => !sheet.getRow(n).getCell(headers.indexOf('Tenant') + 1).value);
  const data = { Tenant: 'Shop A', 'kWh meter number': '001234567890123456', 'Estimated power load (kW)': '10', ...values };
  headers.forEach((label, index) => { if (data[label] != null) sheet.getCell(rowNumber, index + 1).value = data[label]; });
}
const parse = async (book, record) => readMeterImport(await book.xlsx.writeBuffer(), record);

test('template has matching fields, text meter numbers and dropdowns; blank template adds nothing', async () => {
  const record = mapping(), book = await workbook(record);
  expect(book.worksheets.map(s => s.name)).toEqual(['Instructions', 'Mapping Details', 'Meters']);
  expect(book.getWorksheet('Mapping Details').getCell('A2').value).toBe('Property name');
  expect(book.getWorksheet('Mapping Details').getCell('B2').value).toBe('MBZ12');
  const sheet = book.getWorksheet('Meters');
  const columns = sheet.getRow(1).values.slice(1);
  expect(columns).not.toContain('Est. monthly cost (AED)');
  expect(sheet.getColumn(columns.indexOf('kWh meter number') + 1).numFmt).toBe('@');
  expect(sheet.getCell(2, columns.indexOf('Meter status') + 1).dataValidation.formulae).toEqual(['"Active,Inactive,Faulty,Not found"']);
  expect((await parse(book, record)).errors).toContain('Enter at least one meter on the Meters sheet.');
});

test('previous Branch templates still import into the same property data field', async () => {
  const record = mapping(), book = await workbook(record);
  book.getWorksheet('Mapping Details').getCell('A2').value = 'Branch';
  add(book);
  const input = await parse(book, record);
  expect(input.errors).toEqual([]);
  expect(applyMeterImport(record, input).facility.meter.branch).toBe('MBZ12');
});

test('round trip appends visible meters, retains photos, preserves text IDs and calculates costs', async () => {
  const record = mapping(), existing = createMeter(1);
  existing.customValues.meterNumber = 'OLD'; existing.photos = [{ id: 'photo-1' }]; record.items = [existing];
  const book = await workbook(record);
  add(book, { 'Meter type & rating': 'ct', 'Meter status': 'active' });
  add(book, { Tenant: 'Shop B', 'kWh meter number': '00002', 'Mapping No.': '2' });
  const input = await parse(book, record);
  expect(input.errors).toEqual([]);
  const next = applyMeterImport(record, input);
  expect(next.items).toHaveLength(3);
  expect(next.items[0]).toBe(existing);
  expect(next.items[1]).toMatchObject({ assetName: 'Shop A', customValues: { meterNumber: '001234567890123456', mappingNo: '3', meterType: 'CT', meterStatus: 'Active' } });
  expect(meterCosts(next, next.items[1])).toEqual({ monthly: 768, annual: 9216 });
  expect(record.items).toHaveLength(1);
});

test('reports row errors for required, numeric, dropdown and formula values', async () => {
  const record = mapping(), book = await workbook(record);
  add(book, { Tenant: '', 'Daily operating hours': '25', 'Diversity factor': '2', 'Meter status': 'broken', 'Estimated shop size (m²)': { formula: '1+1', result: 2 } });
  const input = await parse(book, record);
  expect(input.errors.join(' ')).toMatch(/row 2: Tenant is required/);
  expect(input.errors.join(' ')).toMatch(/maximum is 24/);
  expect(input.errors.join(' ')).toMatch(/maximum is 1/);
  expect(input.errors.join(' ')).toMatch(/choose Active/);
  expect(input.errors.join(' ')).toMatch(/not formulas/);
  expect(() => applyMeterImport(record, input)).toThrow('Fix the spreadsheet');
});

test('rejects numeric identifiers, duplicates inside the file and duplicates already in the mapping', async () => {
  const record = mapping(), book = await workbook(record);
  add(book, { 'kWh meter number': 12345 });
  expect((await parse(book, record)).errors.join(' ')).toMatch(/format as Text/);
  const duplicate = await workbook(record); add(duplicate); add(duplicate);
  expect((await parse(duplicate, record)).errors.join(' ')).toMatch(/duplicate meter number/);
  const single = await workbook(record); add(single);
  const input = await parse(single, record);
  const existing = createMeter(1); existing.customValues.meterNumber = '001234567890123456';
  expect(() => applyMeterImport({ ...record, items: [existing] }, input)).toThrow('duplicate meter number');
});

test('rejects wrong sheets, missing columns and invalid dates', async () => {
  const record = mapping(), book = await workbook(record);
  add(book); book.getWorksheet('Meters').getCell('A1').value = 'Wrong column';
  const details = book.getWorksheet('Mapping Details');
  details.eachRow(row => { if (row.getCell(1).value === 'kWh reading date') row.getCell(2).value = '2026-02-30'; });
  const input = await parse(book, record);
  expect(input.errors.join(' ')).toMatch(/Missing column: Mapping No/);
  expect(input.errors.join(' ')).toMatch(/valid YYYY-MM-DD/);
  book.removeWorksheet('Meters');
  await expect(parse(book, record)).rejects.toThrow('downloaded template');
});

test('prevents importing into another record, a changed header, approved or deleted mappings', async () => {
  const record = mapping(), book = await workbook(record); add(book);
  const input = await parse(book, record);
  expect(() => applyMeterImport({ ...record, id: 'different' }, input)).toThrow('changed');
  expect(() => applyMeterImport({ ...record, facility: { ...record.facility, meter: { ...record.facility.meter, branch: 'changed' } } }, input)).toThrow('changed');
  expect(() => applyMeterImport({ ...record, reviewStatus: 'approved' }, input)).toThrow('editable');
  expect(() => applyMeterImport({ ...record, facility: { ...record.facility, meter: { ...record.facility.meter, deletedAt: 'today' } } }, input)).toThrow('editable');
});

test('saves the entire batch once, awaits persistence, and refuses success on conflict or disk failure', async () => {
  const record = mapping(), book = await workbook(record); add(book); add(book, { 'kWh meter number': 'SECOND' });
  const input = await parse(book, record);
  const save = vi.fn(async next => ({ ...next, revision: 2 }));
  const result = await saveMeterImport(record, input, save);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][1]).toEqual({ pendingSync: true });
  expect(result.total).toBe(2); expect(result.ids).toHaveLength(2); expect(result.record.revision).toBe(2);
  await expect(saveMeterImport(record, input, async () => ({ conflict: true }))).rejects.toThrow('another tab');
  await expect(saveMeterImport(record, input, async () => { throw new Error('Disk full'); })).rejects.toThrow('Disk full');
});
