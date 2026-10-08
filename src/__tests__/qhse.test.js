import { test, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createQhse, createFinding, findingData, inspectionIssues, isQhse } from '../qhse/model';
vi.mock('../utils/fileSaver', () => ({ saveBlob: vi.fn() }));
const { generateQhsePDF, generateQhseExcel } = await import('../qhse/reports');
const ExcelJS = (await import('exceljs')).default;
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=';
function fixture() {
  const survey = createQhse('project-test');
  survey.facility.address = 'Abu Dhabi'; survey.facility.surveyorName = 'Test Inspector';
  survey.facility.qhse = { ...survey.facility.qhse, projectName: 'QHSE QA Example', reportNumber: 'QA-001', summary: 'Test inspection for export verification.' };
  survey.items = [{ ...createFinding(), location: 'Plant room', defectDescription: 'Damaged electrical cable observed. Isolate and replace.',
    customValues: { qhseType: 'Equipment', severity: 'Critical -2', cafmReference: 'QA-123', findingStatus: 'Open' },
    photos: [{ id: 'p1', dataUrl: photo, caption: 'First view' }, { id: 'p2', dataUrl: photo, caption: 'Second view' }] },
    { ...createFinding(), location: 'Walkway', defectDescription: 'Area clean.', customValues: { qhseType: 'Housekeeping', severity: 'No Impact', findingStatus: 'Closed' } }];
  return survey;
}
function pdfText(buffer) {
  const raw = buffer.toString('latin1'), glyphs = new Map();
  for (const cmap of raw.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of cmap[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) glyphs.set(pair[1].padStart(4, '0').toLowerCase(), String.fromCharCode(parseInt(pair[2], 16)));
  }
  return [...raw.matchAll(/<([0-9a-f]+)>\s*Tj/gi)].map(m => (m[1].match(/.{4}/g) || []).map(g => glyphs.get(g.toLowerCase()) || '').join('')).join('\n');
}
test('new inspection has no reference project data and validation identifies incomplete findings', () => {
  const survey = createQhse('p'); expect(isQhse(survey)).toBe(true); expect(survey.items).toEqual([]);
  expect(survey.facility.qhse.projectName).toBe(''); expect(inspectionIssues(survey)).toHaveLength(2);
  survey.items.push(createFinding()); expect(inspectionIssues(survey)).toHaveLength(6);
  expect(inspectionIssues(fixture())).toEqual([]);
});
test('QHSE fields survive the persisted JSON structure used by cloud sync', () => {
  const s = fixture(); const item = JSON.parse(JSON.stringify(s.items[0]));
  expect(findingData(item).cafmReference).toBe('QA-123'); expect(findingData(item).photos).toHaveLength(2);
  expect(JSON.parse(JSON.stringify(s.facility)).qhse.reportNumber).toBe('QA-001');
});
test('PDF contains findings, CAFM references, photo captions and pagination', async () => {
  const blob = await generateQhsePDF(fixture(), { returnBlob: true });
  const buffer = Buffer.from(await blob.arrayBuffer()); const text = pdfText(buffer);
  expect(text).toContain('QA-123'); expect(text).toContain('Second view'); expect(text).toContain('Page 1 of');
  mkdirSync('outputs/qhse-qa', { recursive: true }); writeFileSync('outputs/qhse-qa/qhse-example.pdf', buffer);
});
test('Excel includes each photo and keeps findings without photos', async () => {
  vi.stubGlobal('Image', class { naturalWidth = 1; naturalHeight = 1; set src(v) { queueMicrotask(() => this.onload()); } });
  const blob = await generateQhseExcel(fixture(), { returnBlob: true }); const buffer = Buffer.from(await blob.arrayBuffer());
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('Findings 1'); expect(sheet.rowCount).toBe(4); expect(sheet.getImages()).toHaveLength(2);
  expect(sheet.getCell('F2').value).toBe('QA-123'); expect(sheet.getCell('J3').value).toBe('Second view');
  expect(sheet.getCell('I4').value).toBe('No photo'); expect(sheet.getCell('G4').value).toBe('Closed');
  expect(sheet.getCell('E2').font.color.argb).toBe('FFB91C2A');
  writeFileSync('outputs/qhse-qa/qhse-example.xlsx', buffer); vi.unstubAllGlobals();
});
test('exports refuse mixed report types and missing evidence', async () => {
  await expect(generateQhsePDF([fixture(), { facility: {} }])).rejects.toThrow('separately');
  const s = fixture(); delete s.items[0].photos[0].dataUrl;
  await expect(generateQhseExcel(s)).rejects.toThrow('Download all');
});
test('PDF supports long findings and captions across pages without omitting the last words', async () => {
  const s = fixture(); s.items[0].defectDescription = ('Safety observation repeated for long text. ').repeat(200) + 'DESCRIPTION_END';
  s.items[0].photos[0].caption = ('Photo evidence caption. ').repeat(300) + 'CAPTION_END';
  const blob = await generateQhsePDF(s, { returnBlob: true }); const buffer = Buffer.from(await blob.arrayBuffer());
  expect(pdfText(buffer)).toContain('DESCRIPTION_END'); expect(pdfText(buffer)).toContain('CAPTION_END');
  writeFileSync('outputs/qhse-qa/qhse-long-text.pdf', buffer);
});
