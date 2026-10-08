import { BRAND, findingData, reportDetails, riskColor, isQhse, activeFields, findingDetails } from './model';
import { OCS_LOGO_TRIMMED } from '../assets/logoTrimmed';
import { saveBlob } from '../utils/fileSaver';
import { OpenSansRegular, OpenSansBold } from './fonts/fontData';

function records(input) {
  const list = Array.isArray(input) ? input : [input];
  if (!list.length || list.some(s => !isQhse(s))) throw new Error('Select QHSE inspections separately from FM condition surveys.');
  for (const s of list) for (const i of s.items || []) for (const p of i.photos || []) {
    if (!p.dataUrl) throw new Error('Download all inspection photos before exporting the report.');
  }
  return list;
}
const filename = input => `${(input.facility?.qhse?.projectName || 'QHSE').replace(/[^a-zA-Z0-9_-]+/g, '_')}_QHSE_report`;
const countSummary = survey => {
  const findings = (survey.items || []).filter(i => !i.customValues?.qhseEvidenceOnly).map(findingData);
  const reportPhotos = (survey.items || []).filter(i => i.customValues?.qhseEvidenceOnly).reduce((n, i) => n + (i.photos || []).length, 0);
  return `${findings.length} findings | ${findings.filter(f => f.status === 'Open').length} open | ${findings.filter(f => f.status === 'Closed').length} closed | ${findings.filter(f => f.status === 'Open' && f.severity === 'Critical -2').length} critical open${reportPhotos ? ` | ${reportPhotos} report photos` : ''}`;
};

export async function generateQhsePDF(input, options = {}) {
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
    doc.text('QHSE Site Inspection Report', 48, 17);
    doc.setFont('OpenSans', 'normal'); doc.setTextColor(`#${BRAND.grey}`);
  };
  const table = (body, startY, head) => autoTable(doc, {
    startY, body, head: head ? [head] : undefined, margin: { top: 29, bottom: 18, left: 15, right: 15 },
    styles: { font: 'OpenSans', fontSize: 9, cellPadding: 3, overflow: 'linebreak', textColor: `#${BRAND.grey}` },
    headStyles: { fillColor: blue }, alternateRowStyles: { fillColor: '#F3F4F8' },
    didDrawPage: header, rowPageBreak: 'avoid'
  });
  for (const [si, survey] of surveys.entries()) {
    if (si) doc.addPage();
    header();
    table(reportDetails(survey).map(([a,b]) => [a, b || '']), 30);
    table([['Finding summary', countSummary(survey)]], doc.lastAutoTable.finalY + 5);
    for (const [index, item] of (survey.items || []).entries()) {
      const f = findingData(item);
      const entryName = item.customValues?.qhseEvidenceOnly ? 'Report photos' : `Finding ${index + 1}`;
      doc.addPage(); header();
      doc.setFontSize(12); doc.setTextColor(blue); doc.text(entryName, 15, 32);
      table(item.customValues?.qhseEvidenceOnly ? [['Evidence', 'Report photographs']] : findingDetails(survey, item), 37);
      let y = doc.lastAutoTable.finalY + 8;
      for (const [pi, photo] of f.photos.entries()) {
        const caption = doc.splitTextToSize(`Photo ${pi + 1} of ${f.photos.length}${photo.caption ? ': ' + photo.caption : ''}`, 176);
        const captionHeight = caption.length * 4;
        if (y + 84 + captionHeight > 276) { doc.addPage(); header(); y = 32; }
        doc.setFontSize(10); doc.setTextColor(`#${riskColor(f.severity)}`);
        doc.text(`${entryName}${f.location ? ` | ${f.location}` : ''}`, 15, y, { maxWidth: 176 });
        y += 7;
        const image = doc.getImageProperties(photo.dataUrl);
        const scale = Math.min(176 / image.width, 68 / image.height);
        const w = image.width * scale, h = image.height * scale;
        doc.addImage(photo.dataUrl, image.fileType, 15 + (176 - w) / 2, y, w, h);
        y += 72;
        // autoTable allows even exceptionally long captions to continue safely.
        table([[`${entryName}, photo ${pi + 1} of ${f.photos.length} — remark`, photo.caption || '']], y);
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    doc.addPage(); header();
    const sign = survey.signatures?.surveyor || {};
    table([['Inspector', sign.name || survey.facility.surveyorName || ''], ['Sign-off date', sign.date || ''], ['Signature', sign.signatureData ? 'Signed' : 'Pending']], 32);
    if (sign.signatureData) doc.addImage(sign.signatureData, 'PNG', 18, doc.lastAutoTable.finalY + 8, 85, 28);
  }
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(`#${BRAND.grey}`);
    doc.text('OCS | QHSE Inspection', 15, 288); doc.text(`Page ${p} of ${doc.getNumberOfPages()}`, 195, 288, { align: 'right' });
  }
  const blob = doc.output('blob');
  if (!options.returnBlob) await saveBlob(blob, `${filename(surveys[0])}.pdf`, 'QHSE inspection report');
  return blob;
}

export async function generateQhseExcel(input, options = {}) {
  const surveys = records(input);
  const module = await import('exceljs'); const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'OCS';
  const logo = await imageDimensions(OCS_LOGO_TRIMMED);
  const fill = color => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } });
  const bottomRule = color => ({ bottom: { style: 'thin', color: { argb: `FF${color}` } } });
  // Pixel extents avoid Excel's fractional-column anchors squeezing images.
  const addPicture = (sheet, source, col, row, x, y, width, height) => {
    const id = workbook.addImage({ base64: source, extension: source.startsWith('data:image/png') ? 'png' : 'jpeg' });
    sheet.addImage(id, { tl: { nativeCol: col, nativeRow: row, nativeColOff: Math.round(x * 9525), nativeRowOff: Math.round(y * 9525) },
      ext: { width, height }, editAs: 'oneCell' });
  };
  for (const [si, survey] of surveys.entries()) {
    const info = workbook.addWorksheet(`Inspection ${si + 1}`, { views: [{ showGridLines: false }],
      properties: { tabColor: { argb: `FF${BRAND.blue}` } },
      pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
    info.columns = [{ width: 28 }, { width: 78 }];
    const logoWidth = 180, logoHeight = logoWidth * logo.height / logo.width;
    info.getRow(1).height = (logoHeight + 24) * 3 / 4;
    addPicture(info, OCS_LOGO_TRIMMED, 0, 0, 8, 12, logoWidth, logoHeight);
    info.addRow(['QHSE Site Inspection Report', '']);
    info.mergeCells('A2:B2');
    info.addRows(reportDetails(survey).map(([k,v]) => [k,v === '' || v == null ? null : v]));
    info.addRow(['Finding summary', countSummary(survey)]);
    const sign = survey.signatures?.surveyor || {};
    info.addRow(['Inspector', sign.name || survey.facility.surveyorName || null]); info.addRow(['Sign-off date', sign.date || null]);
    const sr = info.addRow(['Signature', sign.signatureData ? null : 'Pending']);
    if (sign.signatureData) { sr.height = 68; addPicture(info, sign.signatureData, 1, sr.number - 1, 8, 8, 240, 70); }
    const ws = workbook.addWorksheet(`Findings ${si + 1}`, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1, showGridLines: false }],
      properties: { tabColor: { argb: `FF${BRAND.orange}` } },
      pageSetup: { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1',
        margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
    const fields = activeFields(survey, 'finding');
    const evidenceColumn = fields.length + 2;
    ws.columns = [8, ...fields.map(f => f.type === 'textarea' ? 42 : 20), 10, 38, 42].map(width => ({ width }));
    ws.addRow(['Finding', ...fields.map(f => f.label), 'Photo', 'Evidence', 'Remark']);
    for (const [index, item] of (survey.items || []).entries()) {
      const f = findingData(item);
      for (const [pi, photo] of (f.photos.length ? f.photos : [null]).entries()) {
        const row = ws.addRow([index + 1, ...findingDetails(survey, item).map(([,value]) => value === '' ? null : value), photo ? `${pi + 1}/${f.photos.length}` : null, photo ? null : 'No photo', photo?.caption || null]);
        const dimensions = photo ? await imageDimensions(photo.dataUrl) : null;
        const cellWidth = 38 * 7 + 5, padding = 6;
        const photoScale = dimensions ? Math.min((cellWidth - padding * 2) / dimensions.width, (409 * 4 / 3 - padding * 2) / dimensions.height) : 0;
        const photoWidth = dimensions ? dimensions.width * photoScale : 0;
        const photoHeight = dimensions ? dimensions.height * photoScale : 0;
        row.height = Math.min(409, Math.max(30, (photoHeight + padding * 2) * 3 / 4,
          ...findingDetails(survey, item).map(([,value], i) => textHeight(value, fields[i].type === 'textarea' ? 38 : 18)), textHeight(photo?.caption || '', 38)));
        for (const key of ['severity', 'status']) {
          const column = fields.findIndex(field => field.id === key);
          if (column >= 0) row.getCell(column + 2).font = { color: { argb: `FF${key === 'severity' ? riskColor(f.severity) : f.status === 'Closed' ? BRAND.green : BRAND.red}` }, bold: true };
        }
        if (photo) {
          addPicture(ws, photo.dataUrl, evidenceColumn, row.number - 1, (cellWidth - photoWidth) / 2,
            (row.height * 4 / 3 - photoHeight) / 2, photoWidth, photoHeight);
        }
      }
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: fields.length + 4 } };
    for (const sheet of [info, ws]) sheet.eachRow((row, rn) => {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
        cell.font = { name: 'Open Sans', size: 11, color: { argb: `FF${BRAND.grey}` }, ...cell.font };
        cell.border = bottomRule('DDE2ED');
        if (rn > (sheet === info ? 2 : 1)) cell.fill = fill(rn % 2 ? 'F3F5FA' : 'FFFFFF');
        if (sheet === info && rn > 2 && cell.col === 1) cell.font = { ...cell.font, bold: true, color: { argb: `FF${BRAND.blue}` } };
        if ((sheet === ws && rn === 1) || (sheet === info && rn === 2)) {
          cell.fill = fill(BRAND.blue);
          cell.font = { name: 'Open Sans', size: sheet === info ? 16 : 11, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.alignment = { vertical: 'middle', horizontal: sheet === info ? 'left' : 'center', wrapText: true, indent: sheet === info ? 1 : 0 };
          cell.border = bottomRule(BRAND.orange);
        }
      });
      if (sheet === info && rn > 2 && rn !== sr.number) row.height = Math.max(30, textHeight(row.getCell(1).value, 25), textHeight(row.getCell(2).value, 72));
    });
    ws.getRow(1).height = Math.max(38, ...fields.map(f => textHeight(f.label, f.type === 'textarea' ? 38 : 18)));
    info.getRow(2).height = 40;
    info.pageSetup.printArea = `A1:B${info.rowCount}`;
    ws.pageSetup.printArea = `A1:${ws.getColumn(fields.length + 4).letter}${ws.rowCount}`;
    for (const sheet of [info, ws]) sheet.headerFooter = {
      oddHeader: '&C&"Open Sans,Bold"&10OCS QHSE Inspection',
      oddFooter: '&L&"Open Sans"&9OCS&CQHSE Inspection&RPage &P of &N'
    };
  }
  const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (!options.returnBlob) await saveBlob(blob, `${filename(surveys[0])}.xlsx`, 'QHSE inspection report');
  return blob;
}
function textHeight(value, columns) {
  return String(value || '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / columns)), 0) * 16 + 12;
}
function imageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Could not decode an inspection photo.')); image.src = src;
  });
}
