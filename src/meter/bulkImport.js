import { activeMeterFields, createMeter, headerValue, isMeter, nextMappingNo } from './model';
import { isLocked } from '../utils/workflow';

export const MAX_IMPORT_ROWS = 1000;
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const normalize = value => String(value ?? '').trim().toLowerCase();
const fieldsFor = (survey, scope) => activeMeterFields(survey, scope).filter(f => !f.calculated);
const headerSnapshot = survey => JSON.stringify(fieldsFor(survey, 'header').map(field => [field.id, headerValue(survey, field.id)]));

export async function createMeterImportTemplate(survey) {
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  const instructions = book.addWorksheet('Instructions');
  [
    'Meter Mapping bulk import — one property per workbook',
    '1. Fill Mapping Details, then enter one meter per row on Meters. Keep the column headings unchanged.',
    '2. Property name, Region, Tenant and kWh meter number are required. Any required project fields also apply.',
    '3. Meter numbers must be text: preserve leading zeros. Do not enter formulas.',
    '4. Blank daily hours, diversity and tariff use the Mapping Details defaults.',
    '5. Monthly and annual costs are calculated in the app. Add photos and signatures in the app.',
    '6. Import appends meters; it never replaces existing meters. Duplicate meter or mapping numbers are rejected.',
    `7. Maximum ${MAX_IMPORT_ROWS} meters, 10 MB per .xlsx file. Review the preview before confirming.`,
    '8. Saving on this device is separate from cloud sync. Check the app sync indicator before changing devices.',
    '9. Use YYYY-MM-DD for the reading date. Hours: 0–24; diversity: 0–1; other numbers: zero or greater.'
  ].forEach(line => instructions.addRow([line]));
  instructions.getColumn(1).width = 115;
  instructions.eachRow(row => { row.height = 34; row.alignment = { wrapText: true, vertical: 'middle' }; });
  const details = book.addWorksheet('Mapping Details');
  details.addRow(['Field', 'Value']);
  fieldsFor(survey, 'header').forEach(field => details.addRow([field.label, headerValue(survey, field.id)]));
  details.getColumn(1).width = 40; details.getColumn(2).width = 55;
  details.getColumn(2).numFmt = '@';
  const meters = book.addWorksheet('Meters', { views: [{ state: 'frozen', ySplit: 1 }] });
  const fields = fieldsFor(survey, 'meter');
  meters.columns = fields.map(field => ({ header: field.label, key: field.id, width: Math.min(45, Math.max(22, field.label.length + 2)) }));
  fields.forEach((field, index) => {
    meters.getColumn(index + 1).numFmt = '@';
    if (field.options) for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
      meters.getCell(row, index + 1).dataValidation = { type: 'list', allowBlank: !field.required, formulae: [`"${field.options.join(',')}"`], showErrorMessage: true, error: 'Choose a value from the list.' };
    }
  });
  for (const sheet of [details, meters]) {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C4A6E' } };
    sheet.getRow(1).height = 32;
    sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
  }
  return new Blob([await book.xlsx.writeBuffer()], { type: mime });
}

function cellValue(cell, field) {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value instanceof Date && field.type === 'date') return value.toISOString().slice(0, 10);
    if (value.richText) return value.richText.map(part => part.text).join('').trim();
    throw new Error(`${field.label}: use plain values, not formulas, links or errors.`);
  }
  if (field.id === 'meterNumber' && typeof value === 'number') throw new Error('kWh meter number: format as Text and re-enter the number to preserve every digit.');
  return String(value).trim();
}

function validate(value, field) {
  if (!value) return field.required ? `${field.label} is required.` : null;
  if (field.options && !field.options.some(option => normalize(option) === normalize(value))) return `${field.label}: choose ${field.options.join(', ')}.`;
  if (field.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return `${field.label}: enter a number of zero or greater.`;
    if (field.id === 'operatingHours' && number > 24) return `${field.label}: maximum is 24.`;
    if (field.id === 'diversityFactor' && number > 1) return `${field.label}: maximum is 1.`;
    if (field.id === 'mappingNo' && !Number.isInteger(number)) return 'Mapping No. must be a whole number.';
  }
  if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return `${field.label}: use a valid YYYY-MM-DD date.`;
  return null;
}

export async function readMeterImport(buffer, survey) {
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const details = book.getWorksheet('Mapping Details'), sheet = book.getWorksheet('Meters');
  if (!details || !sheet) throw new Error('Use the downloaded template with Mapping Details and Meters sheets.');
  const errors = [], header = {}, meters = [];
  const headerFields = fieldsFor(survey, 'header'), meterFields = fieldsFor(survey, 'meter');
  const seenDetails = new Set();
  details.eachRow((row, index) => {
    if (index === 1 || !row.getCell(1).text.trim()) return;
    const label = row.getCell(1).text.trim();
    // Accept templates downloaded before Branch was renamed to Property name.
    const field = headerFields.find(f => f.label === label || (f.id === 'branch' && label === 'Branch'));
    if (!field) { errors.push(`Mapping Details row ${index}: unknown field. Download a fresh template.`); return; }
    if (seenDetails.has(field.id)) { errors.push(`Mapping Details: ${field.label} appears twice.`); return; }
    seenDetails.add(field.id);
    try { header[field.id] = cellValue(row.getCell(2), field); } catch (e) { errors.push(`Mapping Details: ${e.message}`); }
  });
  headerFields.forEach(field => {
    if (!seenDetails.has(field.id)) errors.push(`Mapping Details: missing ${field.label}. Download a fresh template.`);
    const issue = validate(header[field.id], field); if (issue) errors.push(`Mapping Details: ${issue}`);
  });
  const columns = new Map();
  sheet.getRow(1).eachCell((cell, column) => {
    const label = cell.text.trim();
    if (columns.has(label)) errors.push(`Duplicate column: ${label}.`);
    columns.set(label, column);
    if (!meterFields.some(f => f.label === label)) errors.push(`Unknown column: ${label}. Download a fresh template.`);
  });
  meterFields.forEach(field => { if (!columns.has(field.label)) errors.push(`Missing column: ${field.label}.`); });
  let count = 0;
  sheet.eachRow((row, index) => {
    if (index === 1 || !row.values.some(value => value != null && String(value).trim() !== '')) return;
    count++;
    if (count > MAX_IMPORT_ROWS) return;
    const values = {};
    for (const field of meterFields) {
      if (!columns.has(field.label)) continue;
      try {
        const value = cellValue(row.getCell(columns.get(field.label)), field);
        const issue = validate(value, field); if (issue) errors.push(`Meters row ${index}: ${issue}`);
        values[field.id] = field.options?.find(option => normalize(option) === normalize(value)) || value;
      } catch (e) { errors.push(`Meters row ${index}: ${e.message}`); }
    }
    meters.push({ row: index, values });
  });
  if (!count) errors.push('Enter at least one meter on the Meters sheet.');
  if (count > MAX_IMPORT_ROWS) errors.push(`Maximum ${MAX_IMPORT_ROWS} meters per import.`);
  const result = { surveyId: survey.id, headerSnapshot: headerSnapshot(survey), header, meters, errors, count };
  if (!errors.length) {
    try { applyMeterImport(survey, result); } catch (e) { errors.push(e.message); }
  }
  return result;
}

export function applyMeterImport(survey, input) {
  if (!isMeter(survey) || isLocked(survey) || survey.facility.meter?.deletedAt) throw new Error('Open an editable meter mapping first.');
  if (input.surveyId !== survey.id || input.headerSnapshot !== headerSnapshot(survey)) throw new Error('Mapping details changed since this file was checked. Upload it again to refresh the preview.');
  if (input.errors.length || !input.meters.length || input.meters.length > MAX_IMPORT_ROWS) throw new Error('Fix the spreadsheet errors before importing.');
  const currentHeader = Object.fromEntries(fieldsFor(survey, 'header').map(f => [f.id, String(headerValue(survey, f.id))]));
  // An upload must not silently change shared details for existing meters.
  if (survey.items.length && Object.keys(input.header).some(key => String(input.header[key]) !== currentHeader[key])) throw new Error('Mapping Details differ from this mapping. Keep its current details or import into a new mapping.');
  const numbers = new Set(survey.items.map(item => normalize(item.customValues?.meterNumber)).filter(Boolean));
  const mappingKey = value => Number.isFinite(Number(value)) ? String(Number(value)) : normalize(value);
  const mappings = new Set(survey.items.map(item => item.customValues?.mappingNo).filter(v => v !== '' && v != null).map(mappingKey));
  // Reserve explicit numbers before generating the blank ones.
  for (const { row, values } of input.meters) {
    const number = normalize(values.meterNumber);
    if (numbers.has(number)) throw new Error(`Meters row ${row}: duplicate meter number ${values.meterNumber}.`);
    numbers.add(number);
    if (values.mappingNo !== '') {
      const mapping = mappingKey(values.mappingNo);
      if (mappings.has(mapping)) throw new Error(`Meters row ${row}: duplicate Mapping No. ${values.mappingNo}.`);
      mappings.add(mapping);
    }
  }
  let nextNumber = nextMappingNo(survey.items);
  const additions = input.meters.map(({ values }) => {
    let mappingNo = values.mappingNo;
    if (mappingNo === '') { while (mappings.has(String(nextNumber))) nextNumber++; mappingNo = String(nextNumber++); mappings.add(mappingNo); }
    return { ...createMeter(mappingNo), assetName: values.tenant, location: values.shopLocation, customValues: { ...values, meter: true, mappingNo } };
  });
  const { surveyorName, ...meterHeader } = input.header;
  return { ...survey, pendingSync: true, facility: { ...survey.facility, surveyorName, meter: { ...survey.facility.meter, ...meterHeader } }, items: [...survey.items, ...additions] };
}

export async function saveMeterImport(survey, input, save) {
  const next = applyMeterImport(survey, input);
  const saved = await save(next, { pendingSync: true });
  if (!saved || saved.conflict) throw new Error('Could not save this import because the mapping changed in another tab. Reopen the mapping and upload again.');
  return { record: saved, ids: next.items.slice(survey.items.length).map(item => item.id), total: next.items.length };
}
