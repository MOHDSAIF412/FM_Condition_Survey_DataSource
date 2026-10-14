import { checkReportCancelled, yieldToScreen } from '../utils/reportTask';
import { BRAND } from '../qhse/model';
import { isMeter, meterData, reportDetails, costTotals, activeMeterFields, METER_FIELDS } from './model';
import { OCS_LOGO_TRIMMED } from '../assets/logoTrimmed';
import { saveBlob } from '../utils/fileSaver';
import { OpenSansRegular, OpenSansBold } from '../qhse/fonts/fontData';

function records(input) {
  const list = Array.isArray(input) ? input : [input];
  if (!list.length || list.some(s => !isMeter(s))) throw new Error('Select meter mappings separately from other modules.');
  for (const s of list) for (const i of s.items || []) for (const p of i.photos || []) {
    if (!p.dataUrl) throw new Error('Download all meter photos before exporting the report.');
  }
  return list;
}
const filename = s => `${(s.facility?.meter?.branch || s.facility?.facilityName || 'Meter').replace(/[^a-zA-Z0-9_-]+/g, '_')}_Meter_Mapping`;
const fixed = n => n == null ? '' : Number(n).toFixed(2);
const display = (field, value) => field.calculated ? fixed(value) : value == null ? '' : String(value);

export async function generateMeterPDF(input, options = {}) {
  const surveys = records(input);
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('OpenSans-Regular.ttf', OpenSansRegular); doc.addFont('OpenSans-Regular.ttf', 'OpenSans', 'normal');
  doc.addFileToVFS('OpenSans-Bold.ttf', OpenSansBold); doc.addFont('OpenSans-Bold.ttf', 'OpenSans', 'bold');
  const blue = `#${BRAND.blue}`;
  const header = () => {
    doc.setFillColor(`#${BRAND.orange}`); doc.rect(0, 0, 3, 297, 'F');
    const logo = doc.getImageProperties(OCS_LOGO_TRIMMED);
    doc.addImage(OCS_LOGO_TRIMMED, 'PNG', 15, 9, 24, 24 * logo.height / logo.width);
    doc.setTextColor(blue); doc.setFontSize(15); doc.setFont('OpenSans', 'bold');
    doc.text('Meter Mapping Report', 48, 17);
    doc.setFont('OpenSans', 'normal'); doc.setTextColor(`#${BRAND.grey}`);
  };
  const table = (body, startY, head, extra = {}) => autoTable(doc, {
    startY, body, head: head ? [head] : undefined, margin: { top: 29, bottom: 18, left: 15, right: 15 },
    styles: { font: 'OpenSans', fontSize: 9, cellPadding: 3, overflow: 'linebreak', textColor: `#${BRAND.grey}` },
    headStyles: { fillColor: blue }, alternateRowStyles: { fillColor: '#F3F4F8' },
    didDrawPage: header, rowPageBreak: 'avoid', ...extra
  });
  for (const [si, survey] of surveys.entries()) {
    checkReportCancelled(options.signal); await yieldToScreen();
    if (si) doc.addPage();
    header();
    table(reportDetails(survey).map(([a, b]) => [a, b || '']), 30, null, { columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } } });
    const rows = (survey.items || []).map((item, i) => {
      const d = meterData(survey, item);
      return [d.mappingNo || i + 1, d.tenant, d.shopLocation, d.meterNumber, d.powerLoad, fixed(d.monthlyCost), fixed(d.annualCost), d.meterStatus, d.kwhReading];
    });
    if (rows.length) table(rows, doc.lastAutoTable.finalY + 6, ['No.', 'Tenant', 'Location', 'Meter no.', 'kW', 'Monthly AED', 'Annual AED', 'Status', 'kWh'], { styles: { font: 'OpenSans', fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', textColor: `#${BRAND.grey}` } });
    for (const [index, item] of (survey.items || []).entries()) {
    checkReportCancelled(options.signal); await yieldToScreen();
      const d = meterData(survey, item);
      const name = `Meter ${index + 1}${d.tenant ? ` | ${d.tenant}` : ''}`;
      doc.addPage(); header();
      doc.setFontSize(12); doc.setTextColor(blue); doc.text(name, 15, 32, { maxWidth: 176 });
      table(activeMeterFields(survey, 'meter').map(f => [f.label, display(f, d[f.id])]), 37, null, { columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' } } });
      let y = doc.lastAutoTable.finalY + 8;
      for (const [pi, photo] of d.photos.entries()) {
        if (y + 84 > 276) { doc.addPage(); header(); y = 32; }
        doc.setFontSize(10); doc.setTextColor(blue);
        doc.text(`${name} | photo ${pi + 1} of ${d.photos.length}`, 15, y, { maxWidth: 176 });
        y += 7;
        const image = doc.getImageProperties(photo.dataUrl);
        const scale = Math.min(176 / image.width, 68 / image.height);
        const w = image.width * scale, h = image.height * scale;
        doc.addImage(photo.dataUrl, image.fileType, 15 + (176 - w) / 2, y, w, h);
        y += 72;
        if (photo.caption) { table([['Remark', photo.caption]], y); y = doc.lastAutoTable.finalY + 8; }
      }
    }
    doc.addPage(); header();
    const sign = survey.signatures?.surveyor || {};
    table([['Surveyor', sign.name || survey.facility.surveyorName || ''], ['Sign-off date', sign.date || ''], ['Signature', sign.signatureData ? 'Signed' : 'Pending']], 32);
    if (sign.signatureData) doc.addImage(sign.signatureData, 'PNG', 18, doc.lastAutoTable.finalY + 8, 85, 28);
  }
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(`#${BRAND.grey}`);
    doc.text('OCS | Meter Mapping', 15, 288); doc.text(`Page ${p} of ${doc.getNumberOfPages()}`, 195, 288, { align: 'right' });
  }
  const blob = doc.output('blob');
  checkReportCancelled(options.signal);
  if (!options.returnBlob) await saveBlob(blob, `${filename(surveys[0])}.pdf`, 'Meter mapping report');
  return blob;
}

// Column order matches the meter mapping spreadsheet the surveyors already use.
const SHEET_COLUMNS = [
  ['Branch', 14], ['Region', 14], ...METER_FIELDS.slice(0, 23).map(f => [f.label, f.type === 'textarea' ? 32 : 16]),
  ['kWh Reading', 14], ['Meter Reference Photo', 30], ['Remarks', 30], ['Other Remarks', 30]
];
const PHOTO_COL = SHEET_COLUMNS.findIndex(([label]) => label === 'Meter Reference Photo');

export async function generateMeterExcel(input, options = {}) {
  const surveys = records(input);
  const module = await import('exceljs'); const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'OCS';
  const fill = color => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } });
  const addPicture = (sheet, source, col, row, x, y, width, height) => {
    const id = workbook.addImage({ base64: source, extension: source.startsWith('data:image/png') ? 'png' : 'jpeg' });
    sheet.addImage(id, { tl: { nativeCol: col, nativeRow: row, nativeColOff: Math.round(x * 9525), nativeRowOff: Math.round(y * 9525) },
      ext: { width, height }, editAs: 'oneCell' });
  };
  for (const [si, survey] of surveys.entries()) {
    checkReportCancelled(options.signal); await yieldToScreen();
    const m = survey.facility?.meter || {};
    const info = workbook.addWorksheet(`Mapping ${si + 1}`, { views: [{ showGridLines: false }], properties: { tabColor: { argb: `FF${BRAND.blue}` } } });
    info.columns = [{ width: 34 }, { width: 60 }];
    info.addRow(['Meter Mapping Report', '']); info.mergeCells('A1:B1');
    info.addRows(reportDetails(survey).map(([k, v]) => [k, v === '' || v == null ? null : v]));
    const sign = survey.signatures?.surveyor || {};
    info.addRow(['Surveyor', sign.name || survey.facility.surveyorName || null]); info.addRow(['Sign-off date', sign.date || null]);
    const sr = info.addRow(['Signature', sign.signatureData ? null : 'Pending']);
    if (sign.signatureData) { sr.height = 68; addPicture(info, sign.signatureData, 1, sr.number - 1, 8, 8, 240, 70); }
    info.eachRow((row, rn) => row.eachCell(cell => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.font = rn === 1 ? { bold: true, size: 16, color: { argb: 'FFFFFFFF' } } : cell.col === 1 ? { bold: true, color: { argb: `FF${BRAND.blue}` } } : {};
      if (rn === 1) cell.fill = fill(BRAND.blue);
    }));

    const ws = workbook.addWorksheet(`Meters ${si + 1}`, { views: [{ state: 'frozen', ySplit: 1, xSplit: 4 }], properties: { tabColor: { argb: `FF${BRAND.orange}` } },
      pageSetup: { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' } });
    const customFields = activeMeterFields(survey, 'meter').filter(f => f.custom);
    const sheetColumns = [...SHEET_COLUMNS, ...customFields.map(f => [f.label, 26])];
    ws.columns = sheetColumns.map(([, width]) => ({ width }));
    const head = ws.addRow(sheetColumns.map(([label]) => label));
    head.height = 42;
    head.eachCell(cell => { cell.fill = fill(BRAND.blue); cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
    const activeIds = new Set(activeMeterFields(survey, 'meter').map(f => f.id));
    METER_FIELDS.slice(0, 23).forEach((field, i) => { ws.getColumn(i + 3).hidden = !activeIds.has(field.id); });
    for (const id of ['kwhReading', 'remarks', 'otherRemarks']) {
      const field = METER_FIELDS.find(f => f.id === id);
      ws.getColumn(SHEET_COLUMNS.findIndex(([label]) => label.toLowerCase() === field.label.toLowerCase()) + 1).hidden = !activeIds.has(id);
    }
    const numeric = new Set(activeMeterFields(survey, 'meter').filter(f => f.type === 'number').map(f => f.id));
    for (const item of survey.items || []) {
    checkReportCancelled(options.signal); await yieldToScreen();
      const d = meterData(survey, item);
      const value = id => { const v = d[id]; if (v === '' || v == null) return null; return numeric.has(id) && Number.isFinite(Number(v)) ? Number(v) : v; };
      const values = [m.branch || null, m.region || null, ...METER_FIELDS.slice(0, 23).map(f => f.calculated ? null : value(f.id)), value('kwhReading'), null, value('remarks'), value('otherRemarks'), ...customFields.map(f => value(f.id))];
      const row = ws.addRow(values);
      // Live formulas, like the source sheet, so edits in Excel recalculate.
      const col = id => 3 + METER_FIELDS.findIndex(f => f.id === id);
      const ref = id => ws.getColumn(col(id)).letter + row.number;
      if (d.monthlyCost != null) {
        row.getCell(col('monthlyCost')).value = { formula: `${ref('powerLoad')}*${ref('diversityFactor')}*${ref('operatingHours')}*30*${ref('tariff')}`, result: d.monthlyCost };
        row.getCell(col('annualCost')).value = { formula: `${ref('monthlyCost')}*12`, result: d.annualCost };
      }
      for (const id of ['monthlyCost', 'annualCost', 'invoicePrice']) row.getCell(col(id)).numFmt = '#,##0.00';
      const photos = d.photos, size = 90, gap = 6;
      const fit = Math.min(photos.length, Math.floor((409 * 4 / 3) / (size + gap)));
      row.height = Math.max(30, fit ? (fit * (size + gap) + gap) * 3 / 4 : 30);
      for (let i = 0; i < fit; i++) addPicture(ws, photos[i].dataUrl, PHOTO_COL, row.number - 1, 8, gap + i * (size + gap), size * 1.4, size);
      if (photos.length > fit) row.getCell(PHOTO_COL + 1).value = `+${photos.length - fit} more photos in the PDF`;
      if (!photos.length) row.getCell(PHOTO_COL + 1).value = 'No photo';
      row.eachCell({ includeEmpty: true }, cell => { cell.alignment = { vertical: 'middle', wrapText: true }; });
    }
    const totals = costTotals(survey);
    const total = ws.addRow([]);
    total.getCell(3 + METER_FIELDS.findIndex(f => f.id === 'tariff')).value = 'Total';
    total.getCell(3 + METER_FIELDS.findIndex(f => f.id === 'monthlyCost')).value = totals.monthly;
    total.getCell(3 + METER_FIELDS.findIndex(f => f.id === 'annualCost')).value = totals.annual;
    total.eachCell(cell => { cell.font = { bold: true }; cell.numFmt = '#,##0.00'; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheetColumns.length } };
  }
  const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  checkReportCancelled(options.signal);
  if (!options.returnBlob) await saveBlob(blob, `${filename(surveys[0])}.xlsx`, 'Meter mapping report');
  return blob;
}
