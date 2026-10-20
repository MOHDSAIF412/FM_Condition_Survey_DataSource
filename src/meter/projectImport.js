import { createMeterMapping, createMeter, METER_FIELDS, HEADER_FIELDS, isMeter, isDeletedMapping, nextMappingNo } from './model';
import { isLocked } from '../utils/workflow';
import { MAX_IMPORT_ROWS } from './bulkImport';
import { extractWorkbookPhotos } from './workbookPhotos';

export const propertyKey = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const columnKey = value => propertyKey(value).replace(/[^a-z0-9]/g, '');
const emptyMarker = value => /^(n\/?a|no meter|no access|not available)$/i.test(String(value).trim());
const aliases = {
  branch: ['Property', 'Property name', 'Branch'], tenant: ['Tenants'],
  shopSize: ['Estimated Shop Size (Square meter)'], powerLoad: ['Estimated POWER LOAD (KW)'],
  invoicePrice: ['Invoice Price (finance record of Apr for REF)'],
  sldAvailable: ['APPROVED SLD & LOAD SCHEDULE AVAILABILITY (Yes/ No)'],
  acSystem: ['Tenant AC system (Independent or Buiding AC)']
};
const fieldFor = label => {
  const key = columnKey(label);
  if (/^kwhreading\d/.test(key)) return 'kwhReading';
  return [...HEADER_FIELDS, ...METER_FIELDS].find(field => [field.label, ...(aliases[field.id] || [])].some(value => columnKey(value) === key))?.id;
};
function plain(cell) {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) throw new Error('Replace input formulas with plain values.');
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (value.richText) return value.richText.map(p => p.text).join('').trim();
    if (value.hyperlink) return String(value.text || '').trim();
    throw new Error('Replace Excel errors with plain values.');
  }
  // Safe integer identifiers can be read without losing digits. Honor zero masks.
  if (typeof value === 'number' && /^0+$/.test(cell.numFmt || '')) return String(value).padStart(cell.numFmt.length, '0');
  if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error('Number exceeds Excel precision. Re-enter identifiers as text.');
  return String(value).trim();
}

export async function createProjectMeterTemplate(project) {
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  const instructions = book.addWorksheet('Instructions');
  [
    `Meter Mapping project import — ${project.name || ''}`,
    'Enter one meter per row on Meters. Repeat Property name and Region for its meters.',
    'The import creates one property for each distinct name in this project and reuses existing properties.',
    'Property name is required. Incomplete tenant/meter details are imported as drafts for review.',
    'Existing meters are skipped, never overwritten. The preview lists new and existing properties.',
    'Mapping numbers can include text such as Kiosk-1. Format meter identifiers as Text.',
    'Costs are recalculated in the app. Embedded JPEG, PNG and WebP meter photos are imported by row.',
    'You can also upload the mall electricity meter sheet with Property, Tenants and KWH METER NUMBER columns.',
    `Maximum ${MAX_IMPORT_ROWS} populated meter rows / 50 MB. Use YYYY-MM-DD dates.`
  ].forEach(line => instructions.addRow([line]));
  instructions.getColumn(1).width = 110;
  instructions.eachRow(row => { row.height = 32; row.alignment = { wrapText: true }; });
  const example = createMeterMapping(project.id, 1, project);
  const custom = example.facility.meter.layout.custom.filter(f => f.scope === 'meter');
  const fields = [HEADER_FIELDS[0], HEADER_FIELDS[1], HEADER_FIELDS[2], ...METER_FIELDS.filter(f => !f.calculated), ...custom];
  const sheet = book.addWorksheet('Meters', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = fields.map(f => ({ header: f.label, key: f.id, width: Math.min(45, Math.max(23, f.label.length + 2)) }));
  fields.forEach((f, index) => { sheet.getColumn(index + 1).numFmt = '@'; });
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C4A6E' } };
  sheet.getRow(1).height = 36; sheet.getRow(1).alignment = { wrapText: true };
  return new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function readProjectMeterImport(buffer, project, { propertyAssignments = {} } = {}) {
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  const photos = await extractWorkbookPhotos(buffer, book);
  const errors = [], warnings = [], unassigned = [], groups = new Map(); let count = 0, skipped = 0, sheets = 0, photoCount = 0;
  const custom = createMeterMapping(project.id, 1, project).facility.meter.layout.custom.filter(f => f.scope === 'meter');
  const fields = [...METER_FIELDS, ...custom];
  for (const sheet of book.worksheets) {
    let columns, start;
    for (let n = 1; n <= Math.min(20, sheet.rowCount); n++) {
      const candidate = new Map();
      sheet.getRow(n).eachCell((cell, col) => {
        const id = fieldFor(cell.text) || custom.find(f => columnKey(f.label) === columnKey(cell.text))?.id;
        if (id && !candidate.has(id)) candidate.set(id, col);
      });
      if (candidate.has('branch') && candidate.has('tenant') && candidate.has('meterNumber')) { columns = candidate; start = n; break; }
    }
    if (!columns) continue;
    sheets++;
    const readingLabel = sheet.getRow(start).getCell(columns.get('kwhReading') || 1).text;
    const dateMatch = readingLabel.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const readingDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : '';
    for (let n = start + 1; n <= sheet.rowCount; n++) {
      const row = sheet.getRow(n), raw = {}, rowLabel = `${sheet.name} row ${n}`;
      const rowPhotos = photos.get(sheet.name)?.get(n) || [];
      for (const [id, column] of columns) {
        if (['monthlyCost', 'annualCost'].includes(id)) continue; // Always calculate these ourselves.
        try { raw[id] = plain(row.getCell(column)); } catch (e) { errors.push(`${rowLabel}: ${id}: ${e.message}`); }
      }
      if (!rowPhotos.length && !['tenant', 'meterNumber', 'shopLocation', 'subLocation', 'powerLoad', 'kwhReading', 'dbOfSupply'].some(id => raw[id])) { if (raw.branch || raw.mappingNo) skipped++; continue; }
      if (++count > MAX_IMPORT_ROWS) continue;
      photoCount += rowPhotos.length;
      const assignmentKey = `${sheet.name}:${n}`;
      if (!raw.branch && propertyAssignments[assignmentKey] === '__skip__') { count--; photoCount -= rowPhotos.length; skipped++; warnings.push(`${rowLabel}: unassigned photo row excluded by the user.`); continue; }
      if (!raw.branch && propertyAssignments[assignmentKey]) raw.branch = propertyAssignments[assignmentKey];
      if (!raw.branch) { unassigned.push({ key: assignmentKey, sheet: sheet.name, row: n, photos: rowPhotos.length }); continue; }
      const key = propertyKey(raw.branch), region = raw.region || '';
      if (!groups.has(key)) groups.set(key, { key, name: raw.branch, region, readingDate: raw.readingDate || readingDate, meters: [] });
      const group = groups.get(key);
      if (group.region && region && propertyKey(group.region) !== propertyKey(region)) errors.push(`${rowLabel}: ${raw.branch} has conflicting regions.`);
      if (!group.region && region) group.region = region;
      const values = {}, notes = [];
      for (const field of fields.filter(f => !f.calculated)) {
        let value = raw[field.id] || '';
        if (field.type === 'number' && value && field.id !== 'mappingNo') {
          const number = Number(value);
          if (!Number.isFinite(number) || number < 0 || (field.id === 'operatingHours' && number > 24) || (field.id === 'diversityFactor' && number > 1)) { notes.push(`${field.label}: ${value}`); value = ''; }
        }
        if (field.options && value) {
          const standard = field.options.find(option => propertyKey(option) === propertyKey(value));
          const alias = field.id === 'meterStatus' && /^not active$/i.test(value) ? 'Inactive' : field.id === 'acSystem' && /^(buiding|mall|market) ac$/i.test(value) ? 'Building AC' : null;
          if (standard || alias) { if (alias) notes.push(`${field.label} in source: ${value}`); value = standard || alias; }
          // Nonstandard values remain visible as an extra selection in the form.
        }
        values[field.id] = value;
      }
      if (!values.tenant || !values.meterNumber || emptyMarker(values.meterNumber)) warnings.push(`${rowLabel}: incomplete tenant/meter details; imported as a draft.`);
      if (notes.length) { warnings.push(`${rowLabel}: ${notes.join('; ')} (original values retained).`); values.otherRemarks = [values.otherRemarks, `Import notes: ${notes.join('; ')}`].filter(Boolean).join('\n'); }
      group.meters.push({ row: n, sheet: sheet.name, values, sourceValues: raw, photos: rowPhotos });
    }
  }
  if (!sheets) errors.push('No meter table found. Use Property name (or Property), Tenant (or Tenants) and kWh meter number columns.');
  if (!count) errors.push('No populated meter rows found.');
  if (count > MAX_IMPORT_ROWS) errors.push(`Maximum ${MAX_IMPORT_ROWS} populated meters per file.`);
  return { projectId: project.id, groups: [...groups.values()], count, skipped, photoCount, unassigned, warnings, errors };
}

function meterKey(values) {
  const number = propertyKey(values.meterNumber);
  if (number && !emptyMarker(number)) return `meter:${number}`;
  return JSON.stringify(['entry', propertyKey(values.mappingNo), propertyKey(values.tenant), propertyKey(values.shopLocation)]);
}
async function stableId(prefix, input) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return prefix + [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function planProjectMeterImport(input, project, existing, firstNumber = 1, preparedBy = '') {
  if (input.projectId !== project.id || input.errors.length || input.unassigned?.length) throw new Error('Select the original project, assign every row to a property and fix the file errors first.');
  const records = [], summary = []; let added = 0, skipped = 0, photosAdded = 0, number = firstNumber;
  for (const group of input.groups) {
    const matches = existing.filter(s => isMeter(s) && s.projectId === project.id && propertyKey(s.facility.meter?.branch) === group.key);
    if (matches.length > 1) throw new Error(`${group.name}: more than one existing property matches. Resolve the duplicate properties before importing.`);
    let record = matches[0];
    if (record && (isDeletedMapping(record) || isLocked(record))) throw new Error(`${group.name}: reopen or restore the existing property before importing.`);
    const isNew = !record;
    if (!record) {
      record = createMeterMapping(project.id, number++, project);
      record.id = await stableId('survey_meter_', `${project.id}|${group.key}`);
      record.facility.meter = { ...record.facility.meter, branch: group.name, region: group.region, readingDate: group.readingDate };
      record.facility.surveyorName = preparedBy;
    }
    const items = record.items.map(item => ({ ...item, photos: [...(item.photos || [])] }));
    const keys = new Map(items.map(item => [meterKey(item.customValues || {}), item]));
    const additions = []; let duplicates = 0, groupPhotos = 0;
    let mappingNo = nextMappingNo(record.items);
    for (const entry of group.meters) {
      const identity = meterKey(entry.values);
      let item = keys.get(identity);
      if (item) { duplicates++; skipped++; }
      else {
        item = createMeter(entry.values.mappingNo || mappingNo++);
        item.id = await stableId('item_meter_', `${project.id}|${group.key}|${identity}`);
        item.assetName = entry.values.tenant; item.location = entry.values.shopLocation;
        item.customValues = { ...item.customValues, ...entry.values, mappingNo: entry.values.mappingNo || item.customValues.mappingNo,
          meter: true, importedSource: entry.sourceValues };
        item.photos = []; keys.set(identity, item); additions.push(item);
      }
      for (const image of entry.photos || []) {
        const id = await stableId('photo_meter_', `${item.id}|${image.dataUrl}`);
        if (item.photos.some(photo => photo.id === id)) continue;
        item.photos.push({ ...image, id, caption: 'Meter reference photo', timestamp: new Date().toISOString(), syncStatus: 'pending' });
        groupPhotos++; photosAdded++;
      }
    }
    added += additions.length;
    if (additions.length || groupPhotos) records.push({ ...record, pendingSync: true, items: [...items, ...additions] });
    summary.push({ name: group.name, isNew, added: additions.length, skipped: duplicates, photos: groupPhotos, total: record.items.length + additions.length, id: record.id });
  }
  return { records, summary, added, skipped, photosAdded, created: summary.filter(s => s.isNew && s.added).length, reused: summary.filter(s => !s.isNew).length };
}
