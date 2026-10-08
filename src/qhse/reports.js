import { BRAND, findingData, reportDetails, riskColor, isQhse } from './model';
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
  const findings = (survey.items || []).map(findingData);
  return `${findings.length} findings | ${findings.filter(f => f.status === 'Open').length} open | ${findings.filter(f => f.status === 'Closed').length} closed | ${findings.filter(f => f.status === 'Open' && f.severity === 'Critical -2').length} critical open`;
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
    table([['Finding summary', countSummary(survey)], ['Inspection summary', survey.facility.qhse.summary || '']], doc.lastAutoTable.finalY + 5);
    for (const [index, item] of (survey.items || []).entries()) {
      const f = findingData(item);
      doc.addPage(); header();
      doc.setFontSize(12); doc.setTextColor(blue); doc.text(`Finding ${index + 1}`, 15, 32);
      table([['Location', f.location], ['Type', f.type], ['Description', f.description], ['Severity', f.severity], ['CAFM reference', f.cafmReference], ['Status', f.status]], 37);
      let y = doc.lastAutoTable.finalY + 8;
      for (const [pi, photo] of f.photos.entries()) {
        const caption = doc.splitTextToSize(`Photo ${pi + 1} of ${f.photos.length}${photo.caption ? ': ' + photo.caption : ''}`, 176);
        const captionHeight = caption.length * 4;
        if (y + 84 + captionHeight > 276) { doc.addPage(); header(); y = 32; }
        doc.setFontSize(10); doc.setTextColor(`#${riskColor(f.severity)}`);
        doc.text(`Finding ${index + 1} | ${f.location}`, 15, y, { maxWidth: 176 });
        y += 7;
        const image = doc.getImageProperties(photo.dataUrl);
        const scale = Math.min(176 / image.width, 68 / image.height);
        const w = image.width * scale, h = image.height * scale;
        doc.addImage(photo.dataUrl, image.fileType, 15 + (176 - w) / 2, y, w, h);
        y += 72;
        // autoTable allows even exceptionally long captions to continue safely.
        table([[`Finding ${index + 1}, photo ${pi + 1} of ${f.photos.length}`, photo.caption || '']], y);
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
  for (const [si, survey] of surveys.entries()) {
    const info = workbook.addWorksheet(`Inspection ${si + 1}`);
    info.columns = [{ width: 24 }, { width: 90 }];
    const logoId = workbook.addImage({ base64: OCS_LOGO_TRIMMED, extension: 'png' });
    info.getRow(1).height = 45;
    info.addImage(logoId, { tl: { col: 0, row: 0 }, br: { col: 0.48, row: 0.77 }, editAs: 'oneCell' });
    info.addRow(['QHSE Site Inspection Report', '']);
    info.addRows(reportDetails(survey).map(([k,v]) => [k,v || '']));
    info.addRow(['Finding summary', countSummary(survey)]);
    info.addRow(['Inspection summary', survey.facility.qhse.summary || '']);
    const sign = survey.signatures?.surveyor || {};
    info.addRow(['Inspector', sign.name || survey.facility.surveyorName || '']); info.addRow(['Sign-off date', sign.date || '']);
    const sr = info.addRow(['Signature', sign.signatureData ? '' : 'Pending']);
    if (sign.signatureData) { sr.height = 60; const id = workbook.addImage({ base64: sign.signatureData, extension: 'png' }); info.addImage(id, { tl: { col: 1, row: sr.number - 1 }, br: { col: 1.35, row: sr.number - 0.12 }, editAs: 'oneCell' }); }
    const ws = workbook.addWorksheet(`Findings ${si + 1}`, { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' } });
    ws.columns = [8, 25, 23, 65, 18, 24, 14, 12, 38, 45].map(width => ({ width }));
    ws.addRow(['Finding', 'Location', 'Type', 'Description', 'Severity', 'CAFM reference', 'Status', 'Photo', 'Evidence', 'Caption']);
    for (const [index, item] of (survey.items || []).entries()) {
      const f = findingData(item);
      for (const [pi, photo] of (f.photos.length ? f.photos : [null]).entries()) {
        const row = ws.addRow([index + 1, f.location, f.type, f.description, f.severity, f.cafmReference, f.status, photo ? `${pi + 1}/${f.photos.length}` : '', photo ? '' : 'No photo', photo?.caption || '']);
        row.height = Math.max(photo ? 120 : 30, ...[f.location, f.type, f.description, photo?.caption || ''].map((t,i) => Math.ceil(t.length / [23,21,58,40][i]) * 14 + 10));
        row.getCell(5).font = { color: { argb: `FF${riskColor(f.severity)}` }, bold: true };
        row.getCell(7).font = { color: { argb: `FF${f.status === 'Closed' ? BRAND.green : BRAND.red}` }, bold: true };
        if (photo) {
          const dimensions = await imageDimensions(photo.dataUrl);
          const scale = Math.min(245 / dimensions.width, 145 / dimensions.height);
          const id = workbook.addImage({ base64: photo.dataUrl, extension: photo.dataUrl.startsWith('data:image/png') ? 'png' : 'jpeg' });
          ws.addImage(id, { tl: { col: 8.03, row: row.number - 0.97 }, br: {
            col: 8.03 + dimensions.width * scale / (38 * 7 + 5),
            row: row.number - 0.97 + dimensions.height * scale / (row.height * 4 / 3)
          }, editAs: 'oneCell' });
        }
      }
    }
    ws.autoFilter = { from: 'A1', to: `J${ws.rowCount}` };
    for (const sheet of [info, ws]) sheet.eachRow((row, rn) => {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.font = { name: 'Open Sans', size: 10, color: { argb: `FF${BRAND.grey}` }, ...cell.font };
        if ((sheet === ws && rn === 1) || (sheet === info && rn === 2)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.blue}` } };
          cell.font = { name: 'Open Sans', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        }
      });
      if (sheet === info && rn > 2 && rn !== sr.number) row.height = Math.max(27, Math.ceil(String(row.getCell(2).value || '').length / 80) * 15 + 8);
    });
    ws.getRow(1).height = 32; info.getRow(2).height = 30;
  }
  const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (!options.returnBlob) await saveBlob(blob, `${filename(surveys[0])}.xlsx`, 'QHSE inspection report');
  return blob;
}
function imageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Could not decode an inspection photo.')); image.src = src;
  });
}
