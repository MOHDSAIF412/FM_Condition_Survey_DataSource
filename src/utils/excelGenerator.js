import ExcelJS from 'exceljs';
import { PRIORITY_LEVELS, DEPARTMENTS, calculateSurveyStats } from '../types/survey.js';
import { OCS_LOGO_BASE64 } from '../assets/logoDataUrl.js';

/**
 * Converts image data (including SVG data URLs) to a clean JPEG base64 string via an offscreen
 * canvas so ExcelJS can safely embed it into Microsoft Excel drawingML.
 * Resolves to { base64, width, height } so the caller can scale the photo to its cell
 * without distorting it. Resolves to null when the image cannot be read.
 */
async function getSafeJpegImage(dataUrl) {
  if (!dataUrl) return null;
  if (typeof window === 'undefined') {
    if (dataUrl.includes('base64,')) {
      return { base64: dataUrl.split('base64,')[1], width: 0, height: 0 };
    }
    return null;
  }

  return new Promise((resolve) => {
    const fallback = () => {
      if (dataUrl.includes('base64,')) {
        resolve({ base64: dataUrl.split('base64,')[1], width: 0, height: 0 });
      } else {
        resolve(null);
      }
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || 600;
        const h = img.naturalHeight || 400;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const jpegData = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: jpegData.split('base64,')[1], width: w, height: h });
      } catch (err) {
        console.warn('Canvas conversion failed for Excel image:', err);
        fallback();
      }
    };
    img.onerror = fallback;
    img.src = dataUrl;
  });
}

/* --- Excel geometry helpers -------------------------------------------------
 * ExcelJS writes ext.width/ext.height in pixels @96dpi and the anchor offsets
 * (nativeColOff / nativeRowOff) straight through as EMUs. Working in those
 * units directly lets an image be centred inside a cell to the pixel, instead
 * of relying on ExcelJS's approximate fractional col/row anchors.
 */
const EMU_PER_PIXEL = 9525;

// Excel column width (character units) -> pixels, for the default 11pt font.
function colWidthToPx(widthChars) {
  return Math.round(widthChars * 7) + 5;
}

// Excel row height (points) -> pixels.
function rowHeightToPx(heightPts) {
  return Math.round((heightPts * 96) / 72);
}

/**
 * Places an image inside a cell box so it is fully contained and centred on all
 * four sides: the aspect ratio is preserved, the image never overflows the box,
 * and the leftover space is split evenly around it.
 *
 * @param {object} ws           target worksheet
 * @param {number} imageId      id returned by workbook.addImage
 * @param {object} img          { width, height } natural pixel size of the photo
 * @param {object} box          { col, row, widthPx, heightPx, padding }
 *                              col/row are 0-based anchor indices.
 */
function placeImageInBox(ws, imageId, img, box) {
  const padding = box.padding === undefined ? 6 : box.padding;
  const boxW = Math.max(1, box.widthPx - padding * 2);
  const boxH = Math.max(1, box.heightPx - padding * 2);

  // Fall back to the box ratio when the natural size is unknown.
  const natW = img && img.width > 0 ? img.width : boxW;
  const natH = img && img.height > 0 ? img.height : boxH;

  const scale = Math.min(boxW / natW, boxH / natH);
  const drawW = Math.max(1, Math.round(natW * scale));
  const drawH = Math.max(1, Math.round(natH * scale));

  const offsetX = Math.round((box.widthPx - drawW) / 2);
  const offsetY = Math.round((box.heightPx - drawH) / 2);

  ws.addImage(imageId, {
    tl: {
      nativeCol: box.col,
      nativeColOff: offsetX * EMU_PER_PIXEL,
      nativeRow: box.row,
      nativeRowOff: offsetY * EMU_PER_PIXEL
    },
    ext: { width: drawW, height: drawH },
    editAs: 'oneCell'
  });
}

/**
 * Generates an audit-ready multi-sheet Microsoft Excel (.xlsx) Report
 * Organized Facility-wise with embedded defect photos, clean columns, and no redundant metadata.
 */
export async function generateSurveyExcel(survey, selectedFacility = 'ALL') {
  // Filter items if a specific facility / location is selected
  const allItems = survey.items || [];
  const itemsToReport = selectedFacility === 'ALL'
    ? allItems
    : allItems.filter((i) => (i.location || 'General') === selectedFacility);

  const stats = calculateSurveyStats(itemsToReport);
  const facility = survey.facility || {};
  const googleLoc = facility.googleLocation || {};

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FM Condition Survey Engine';
  workbook.lastModifiedBy = facility.surveyorName || 'Surveyor';
  workbook.created = new Date();
  workbook.modified = new Date();

  const primaryNavy = 'FF0F172A';
  const headerBlue = 'FF0284C7';
  const facilityHeaderBg = 'FF1E293B';
  const lightGreyFill = 'FFF8FAFC';

  const siteAddress = googleLoc.address || facility.address || 'Facility Site';
  const gpsCoords = (googleLoc.latitude && googleLoc.longitude)
    ? `${googleLoc.latitude}, ${googleLoc.longitude}`
    : 'N/A';
  const mapsUrl = googleLoc.mapsUrl || (googleLoc.latitude ? `https://www.google.com/maps?q=${googleLoc.latitude},${googleLoc.longitude}` : '');

  // ==========================================
  // SHEET 1: EXECUTIVE SUMMARY & COVER
  // ==========================================
  const wsExec = workbook.addWorksheet('Executive Summary', {
    views: [{ showGridLines: true }]
  });

  wsExec.columns = [
    { width: 5 },
    { width: 32 },
    { width: 45 },
    { width: 22 },
    { width: 25 },
    { width: 25 }
  ];

  // Title Banner
  wsExec.mergeCells('B2:F2');
  const titleCell = wsExec.getCell('B2');
  titleCell.value = selectedFacility === 'ALL'
    ? 'FACILITY CONDITION ASSESSMENT & SNAGGING AUDIT REPORT'
    : `FACILITY CONDITION REPORT — ${selectedFacility.toUpperCase()}`;
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsExec.getRow(2).height = 34;

  // Subtitle
  wsExec.mergeCells('B3:F3');
  const subCell = wsExec.getCell('B3');
  subCell.value = `${facility.facilityName || facility.buildingName || 'Condition Survey'} • ${selectedFacility === 'ALL' ? 'All Facility Locations' : selectedFacility}`;
  subCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFBAE6FD' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsExec.getRow(3).height = 24;

  // Embed OCS Company Logo in Executive Sheet
  const LOGO_ROW = 4;
  const LOGO_ROW_HEIGHT_PTS = 54;
  try {
    const logo = await getSafeJpegImage(OCS_LOGO_BASE64);
    const cleanLogo = OCS_LOGO_BASE64.split('base64,')[1];
    if (cleanLogo) {
      const logoId = workbook.addImage({
        base64: cleanLogo,
        extension: 'png'
      });
      // Logo box spans columns E-F on row 4, scaled to fit without stretching.
      wsExec.getRow(LOGO_ROW).height = LOGO_ROW_HEIGHT_PTS;
      placeImageInBox(wsExec, logoId, logo, {
        col: 4, // column E (0-based)
        row: LOGO_ROW - 1,
        widthPx: colWidthToPx(25) + colWidthToPx(25),
        heightPx: rowHeightToPx(LOGO_ROW_HEIGHT_PTS),
        padding: 6
      });
    }
  } catch (err) {
    console.warn('Could not embed OCS logo in Excel:', err);
  }

  // Facility Metadata Section
  wsExec.getCell('B5').value = '1. FACILITY & SITE SPECIFICATIONS';
  wsExec.getCell('B5').font = { name: 'Arial', size: 11, bold: true, color: { argb: primaryNavy } };

  const metaFields = [
    ['Facility / Complex Name', facility.facilityName || facility.buildingName || 'N/A'],
    ['Primary Building Title', facility.buildingName || 'N/A'],
    ['Asset / Building Reference Code', facility.buildingCode || 'N/A'],
    ['Site Physical Address', facility.address || 'N/A'],
    ['Google Location Address', siteAddress],
    ['Google GPS Coordinates', gpsCoords],
    ['Google Maps Link', mapsUrl ? { text: 'Open Google Maps Pin', hyperlink: mapsUrl } : 'N/A'],
    ['Access Landmarks / Gate', googleLoc.description || 'N/A'],
    ['Gross Internal Area (GIA)', facility.grossInternalArea || 'N/A'],
    ['Building Age / Year Built', facility.buildingAge || 'N/A'],
    ['Building Levels & Floors', facility.floorsCount || 'N/A'],
    ['Report Scope', selectedFacility === 'ALL' ? 'Comprehensive facility-wide audit' : `Facility-specific audit for ${selectedFacility}`]
  ];

  let curRow = 6;
  metaFields.forEach(([lbl, val]) => {
    wsExec.getCell(`B${curRow}`).value = lbl;
    wsExec.getCell(`B${curRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    wsExec.getCell(`B${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGreyFill } };
    
    wsExec.getCell(`C${curRow}`).value = val;
    wsExec.getCell(`C${curRow}`).font = { name: 'Arial', size: 9, color: { argb: 'FF0F172A' } };
    if (typeof val === 'object' && val?.hyperlink) {
      wsExec.getCell(`C${curRow}`).font = { name: 'Arial', size: 9, color: { argb: 'FF0284C7' }, underline: true };
    }
    curRow++;
  });

  // Stakeholders Section
  curRow++;
  wsExec.getCell(`B${curRow}`).value = '2. AUDIT STAKEHOLDERS & CERTIFICATION';
  wsExec.getCell(`B${curRow}`).font = { name: 'Arial', size: 11, bold: true, color: { argb: primaryNavy } };
  curRow++;

  const stakeFields = [
    ['Lead Surveyor / Inspector', facility.surveyorName || 'N/A'],
    ['Surveying Consultancy / Firm', facility.surveyorCompany || 'N/A'],
    ['Client / Property Owner', facility.clientName || 'N/A'],
    ['Facility Manager', facility.facilityManager || 'N/A'],
    ['Inspection Survey Date', facility.surveyDate || new Date().toISOString().split('T')[0]],
    ['Surveyor Sign-Off', survey.signatures?.surveyor?.signatureData ? 'Certified & Signed' : 'Pending Signature'],
    ['Client Sign-Off', survey.signatures?.client?.signatureData ? 'Certified & Signed' : 'Pending Signature']
  ];

  stakeFields.forEach(([lbl, val]) => {
    wsExec.getCell(`B${curRow}`).value = lbl;
    wsExec.getCell(`B${curRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    wsExec.getCell(`B${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGreyFill } };
    wsExec.getCell(`C${curRow}`).value = val;
    wsExec.getCell(`C${curRow}`).font = { name: 'Arial', size: 9, color: { argb: 'FF0F172A' } };
    curRow++;
  });

  // KPI Scorecards (Columns D & E)
  wsExec.getCell('D5').value = '3. EXECUTIVE AUDIT SCORECARD';
  wsExec.getCell('D5').font = { name: 'Arial', size: 11, bold: true, color: { argb: primaryNavy } };

  const kpis = [
    { label: 'TOTAL ASSETS AUDITED', val: stats.total, color: 'FF0F172A', sub: 'Cataloged building elements' },
    { label: 'TOTAL DEFECT PHOTOS', val: stats.totalPhotos, color: 'FF0284C7', sub: 'Attached photographic evidence' },
    { label: 'URGENT HAZARDS (P1)', val: stats.priorityCounts[1], color: 'FFDC2626', sub: 'Immediate life safety' },
    { label: 'REMEDIAL CAPEX BUDGET', val: `$${stats.totalCost.toLocaleString()}`, color: 'FF0F172A', sub: 'Estimated remediation expenditure' }
  ];

  let kpiRow = 6;
  kpis.forEach((kpi) => {
    wsExec.mergeCells(`D${kpiRow}:E${kpiRow}`);
    const cell = wsExec.getCell(`D${kpiRow}`);
    cell.value = kpi.label;
    cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF64748B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGreyFill } };
    kpiRow++;

    wsExec.mergeCells(`D${kpiRow}:E${kpiRow}`);
    const valCell = wsExec.getCell(`D${kpiRow}`);
    valCell.value = kpi.val;
    valCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: kpi.color } };
    valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGreyFill } };
    wsExec.getRow(kpiRow).height = 24;
    kpiRow++;

    wsExec.mergeCells(`D${kpiRow}:E${kpiRow}`);
    const subCell = wsExec.getCell(`D${kpiRow}`);
    subCell.value = kpi.sub;
    subCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF94A3B8' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGreyFill } };
    kpiRow += 2;
  });

  // Priority Schedule Table on Executive Sheet
  wsExec.getCell(`D${kpiRow}`).value = '4. REMEDIATION PRIORITY BREAKDOWN';
  wsExec.getCell(`D${kpiRow}`).font = { name: 'Arial', size: 11, bold: true, color: { argb: primaryNavy } };
  kpiRow++;

  const prioritySched = [
    ['Priority 1 (Urgent)', stats.priorityCounts[1], 'Immediate hazard'],
    ['Priority 2 (Essential)', stats.priorityCounts[2], 'Essential repair'],
    ['Priority 3 (Desirable)', stats.priorityCounts[3], 'Desirable maintenance'],
    ['Priority 4 (Long Term)', stats.priorityCounts[4], 'Lifecycle monitoring']
  ];

  prioritySched.forEach(([pLabel, count, pDesc]) => {
    wsExec.getCell(`D${kpiRow}`).value = pLabel;
    wsExec.getCell(`D${kpiRow}`).font = { name: 'Arial', size: 9, bold: true };
    wsExec.getCell(`E${kpiRow}`).value = `${count} Items (${pDesc})`;
    wsExec.getCell(`E${kpiRow}`).font = { name: 'Arial', size: 9, color: { argb: 'FF475569' } };
    kpiRow++;
  });

  // ==========================================
  // SHEET 2: DEPARTMENTAL CAPEX SUMMARY
  // ==========================================
  const wsDept = workbook.addWorksheet('Departmental CapEx', {
    views: [{ showGridLines: true }]
  });

  wsDept.columns = [
    { width: 6 },
    { width: 32 },
    { width: 18 },
    { width: 25 },
    { width: 18 }
  ];

  wsDept.mergeCells('B2:E2');
  const deptTitle = wsDept.getCell('B2');
  deptTitle.value = 'MAINTENANCE DEPARTMENT / TRADE CAPEX ALLOCATION';
  deptTitle.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  deptTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
  deptTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  wsDept.getRow(2).height = 28;

  const deptHeaders = ['Department / Trade', 'Defect Count', 'Remedial Budget ($)', 'CapEx Share (%)'];
  const deptHeaderRow = wsDept.getRow(4);
  deptHeaderRow.values = ['', ...deptHeaders];
  deptHeaderRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  deptHeaderRow.height = 22;

  ['B4', 'C4', 'D4', 'E4'].forEach((c) => {
    wsDept.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBlue } };
    wsDept.getCell(c).alignment = { vertical: 'middle', horizontal: c === 'B4' ? 'left' : 'center' };
  });

  let dRowIdx = 5;
  Object.keys(DEPARTMENTS).forEach((dKey) => {
    const dInfo = DEPARTMENTS[dKey];
    const dStat = stats.departmentStats[dKey] || { count: 0, cost: 0 };
    const pct = stats.totalCost > 0 ? (dStat.cost / stats.totalCost) : 0;

    const row = wsDept.getRow(dRowIdx);
    row.values = [
      '',
      dInfo.name,
      dStat.count,
      dStat.cost,
      pct
    ];
    row.font = { name: 'Arial', size: 9 };
    wsDept.getCell(`C${dRowIdx}`).alignment = { horizontal: 'center' };
    wsDept.getCell(`D${dRowIdx}`).numFmt = '"$"#,##0';
    wsDept.getCell(`E${dRowIdx}`).numFmt = '0.0%';
    wsDept.getCell(`E${dRowIdx}`).alignment = { horizontal: 'center' };
    dRowIdx++;
  });

  // Total row
  const totalRow = wsDept.getRow(dRowIdx);
  totalRow.values = [
    '',
    'TOTAL (All Departments Combined)',
    stats.total,
    stats.totalCost,
    1.0
  ];
  totalRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: primaryNavy } };
  totalRow.height = 22;
  ['B', 'C', 'D', 'E'].forEach((col) => {
    const c = wsDept.getCell(`${col}${dRowIdx}`);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
  });
  wsDept.getCell(`C${dRowIdx}`).alignment = { horizontal: 'center' };
  wsDept.getCell(`D${dRowIdx}`).numFmt = '"$"#,##0';
  wsDept.getCell(`E${dRowIdx}`).numFmt = '100.0%';
  wsDept.getCell(`E${dRowIdx}`).alignment = { horizontal: 'center' };

  // ==========================================
  // SHEET 3: DETAILED SNAG REGISTER (FACILITIES WISE, CLEAN COLUMNS)
  // ==========================================
  // Columns requested to be removed:
  // - Photo Captions
  // - Photos Count
  // - Unit
  // - Urgency Timeframe
  // - Google Location & GPS
  // Remaining Clean Columns:
  // A: Snag #
  // B: Evidence Photo
  // C: Facility / Location
  // D: Asset / Component Name
  // E: Department / Trade
  // F: Priority
  // G: Observed Defects & Notes
  // H: Quantity
  // I: Est. Cost ($)
  // ==========================================

  const wsSnags = workbook.addWorksheet('Snag & Asset Register', {
    views: [{ showGridLines: true }]
  });

  // Evidence thumbnail box on the Snag Register: one cell, photo centred inside.
  const THUMB_COL_WIDTH = 24;          // ~173 px
  const THUMB_ROW_HEIGHT_PTS = 84;     // ~112 px
  const THUMB_PADDING_PX = 6;

  wsSnags.columns = [
    { width: 8 },  // A: Snag #
    { width: THUMB_COL_WIDTH }, // B: Evidence Photo Thumbnail
    { width: 32 }, // C: Facility / Location
    { width: 34 }, // D: Asset / Component Name
    { width: 24 }, // E: Department / Trade
    { width: 14 }, // F: Priority
    { width: 48 }, // G: Observed Defects & Notes
    { width: 10 }, // H: Quantity
    { width: 18 }  // I: Est. Cost ($)
  ];

  // Header banner
  wsSnags.mergeCells('A1:I1');
  const snagBanner = wsSnags.getCell('A1');
  snagBanner.value = selectedFacility === 'ALL'
    ? 'FACILITY-WISE ASSET CONDITION & DEFECT SCHEDULE'
    : `ASSET DEFECT SCHEDULE — ${selectedFacility.toUpperCase()}`;
  snagBanner.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  snagBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
  snagBanner.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSnags.getRow(1).height = 28;

  // Clean Table Headers
  const snagHeaders = [
    'Snag #',
    'Evidence Photo',
    'Asset Location / Room',
    'Asset / Component Name',
    'Department / Trade',
    'Priority',
    'Observed Defects & Notes',
    'Quantity',
    'Est. Cost ($)'
  ];

  const headerRow = wsSnags.getRow(3);
  headerRow.values = snagHeaders;
  headerRow.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.height = 24;

  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  colLetters.forEach((col) => {
    const c = wsSnags.getCell(`${col}3`);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBlue } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  let snagRowIdx = 4;
  const facName = facility.facilityName || facility.buildingName || 'Commercial Facility';

  // Facility Section Header Row
  wsSnags.mergeCells(`A${snagRowIdx}:I${snagRowIdx}`);
  const facBannerCell = wsSnags.getCell(`A${snagRowIdx}`);
  facBannerCell.value = `🏢 FACILITY: ${facName.toUpperCase()} (${itemsToReport.length} Audited Assets  •  $${stats.totalCost.toLocaleString()} Total Remedial CapEx)`;
  facBannerCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  facBannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: facilityHeaderBg } };
  facBannerCell.alignment = { vertical: 'middle', indent: 1 };
  wsSnags.getRow(snagRowIdx).height = 26;
  snagRowIdx++;

  // Populate snag rows and embed thumbnails
  for (let i = 0; i < itemsToReport.length; i++) {
    const item = itemsToReport[i];
    const dept = DEPARTMENTS[item.department] || DEPARTMENTS.GENERAL;
    const photos = item.photos || [];

    const row = wsSnags.getRow(snagRowIdx);
    row.values = [
      i + 1,
      '', // Placeholder for embedded thumbnail in Col B
      item.location || 'General Site Area',
      item.assetName || 'Unnamed Asset',
      dept.name,
      `P${item.priority}`,
      item.defectDescription || 'No defect observed.',
      item.quantity || 1,
      parseFloat(item.estimatedCost) || 0
    ];

    row.font = { name: 'Arial', size: 9 };
      row.height = THUMB_ROW_HEIGHT_PTS; // Photo box height

      // Draw the thumbnail box so the photo sits inside a clean framed cell
      const thumbCell = wsSnags.getCell(`B${snagRowIdx}`);
      thumbCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      thumbCell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
      thumbCell.alignment = { horizontal: 'center', vertical: 'middle' };

      wsSnags.getCell(`A${snagRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
      wsSnags.getCell(`A${snagRowIdx}`).font = { bold: true };
      wsSnags.getCell(`C${snagRowIdx}`).alignment = { vertical: 'middle' };
      wsSnags.getCell(`C${snagRowIdx}`).font = { bold: true };
      wsSnags.getCell(`D${snagRowIdx}`).alignment = { vertical: 'middle' };
      wsSnags.getCell(`D${snagRowIdx}`).font = { bold: true };
      wsSnags.getCell(`E${snagRowIdx}`).alignment = { vertical: 'middle' };
      wsSnags.getCell(`F${snagRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
      wsSnags.getCell(`F${snagRowIdx}`).font = {
        bold: true,
        color: { argb: item.priority === 1 ? 'FFDC2626' : item.priority === 2 ? 'FFF97316' : 'FF0F172A' }
      };
      wsSnags.getCell(`G${snagRowIdx}`).alignment = { vertical: 'middle', wrapText: true };
      wsSnags.getCell(`H${snagRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
      wsSnags.getCell(`I${snagRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      wsSnags.getCell(`I${snagRowIdx}`).numFmt = '"$"#,##0';
      wsSnags.getCell(`I${snagRowIdx}`).font = { bold: true };

      // Embed photo thumbnail in Col B
      if (photos.length > 0 && photos[0].dataUrl) {
        try {
          const safeImg = await getSafeJpegImage(photos[0].dataUrl);
          if (safeImg && safeImg.base64) {
            const imageId = workbook.addImage({
              base64: safeImg.base64,
              extension: 'jpeg'
            });

            placeImageInBox(wsSnags, imageId, safeImg, {
              col: 1, // column B (0-based)
              row: snagRowIdx - 1,
              widthPx: colWidthToPx(THUMB_COL_WIDTH),
              heightPx: rowHeightToPx(THUMB_ROW_HEIGHT_PTS),
              padding: THUMB_PADDING_PX
            });
          }
        } catch (imgErr) {
          console.warn('Failed embedding thumbnail into Excel:', imgErr);
        }
      } else {
        wsSnags.getCell(`B${snagRowIdx}`).value = 'No photo';
        wsSnags.getCell(`B${snagRowIdx}`).font = { italic: true, color: { argb: 'FF94A3B8' } };
        wsSnags.getCell(`B${snagRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
      }

      snagRowIdx++;
    }

  // ==========================================
  // SHEET 4: DEFECT PHOTOGRAPHIC EVIDENCE LOG (FULL GALLERY)
  // ==========================================
  const itemsWithPhotos = itemsToReport.filter((i) => i.photos && i.photos.length > 0);

  if (itemsWithPhotos.length > 0) {
    const wsPhotos = workbook.addWorksheet('Photo Evidence Log', {
      views: [{ showGridLines: true }]
    });

    // Each photo gets a single framed box spanning the 7 detail rows beside it.
    const PHOTO_COL_WIDTH = 43;        // ~306 px
    const PHOTO_ROW_PTS = 22;          // ~29 px per row
    const PHOTO_BLOCK_ROWS = 7;
    const PHOTO_PADDING_PX = 10;
    const PHOTO_BOX_HEIGHT_PX = rowHeightToPx(PHOTO_ROW_PTS) * PHOTO_BLOCK_ROWS;

    wsPhotos.columns = [
      { width: 4 },
      { width: PHOTO_COL_WIDTH }, // Photo image block
      { width: 28 }, // Info labels
      { width: 48 }, // Info values
      { width: 20 }
    ];

    wsPhotos.mergeCells('B2:E2');
    const photoBanner = wsPhotos.getCell('B2');
    photoBanner.value = selectedFacility === 'ALL'
      ? 'DEFECT PHOTOGRAPHIC EVIDENCE LOG'
      : `DEFECT PHOTOGRAPHIC LOG — ${selectedFacility.toUpperCase()}`;
    photoBanner.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    photoBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
    photoBanner.alignment = { horizontal: 'center', vertical: 'middle' };
    wsPhotos.getRow(2).height = 28;

    let pRowIdx = 4;

    for (let i = 0; i < itemsWithPhotos.length; i++) {
      const item = itemsWithPhotos[i];
      const dept = DEPARTMENTS[item.department] || DEPARTMENTS.GENERAL;
      const priority = PRIORITY_LEVELS[item.priority] || PRIORITY_LEVELS[2];
      const totalPhotos = item.photos.length;

      for (let p = 0; p < totalPhotos; p++) {
        const photo = item.photos[p];
        const currentRow = pRowIdx;

        // Fixed, known row heights so the photo box geometry is exact
        for (let r = 0; r < PHOTO_BLOCK_ROWS; r++) {
          wsPhotos.getRow(currentRow + r).height = PHOTO_ROW_PTS;
        }

        // Merge column B across the block into a single framed photo box
        wsPhotos.mergeCells(`B${currentRow}:B${currentRow + PHOTO_BLOCK_ROWS - 1}`);
        const photoBox = wsPhotos.getCell(`B${currentRow}`);
        photoBox.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        photoBox.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
        photoBox.alignment = { horizontal: 'center', vertical: 'middle' };

        // Info details next to photo
        wsPhotos.getCell(`C${currentRow}`).value = `Snag Item #${i + 1}:`;
        wsPhotos.getCell(`C${currentRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF64748B' } };
        wsPhotos.getCell(`D${currentRow}`).value = `${item.assetName} (Photo ${p + 1} of ${totalPhotos})`;
        wsPhotos.getCell(`D${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };

        wsPhotos.getCell(`C${currentRow + 1}`).value = 'Asset Location / Room:';
        wsPhotos.getCell(`C${currentRow + 1}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF64748B' } };
        wsPhotos.getCell(`D${currentRow + 1}`).value = item.location || 'General Site Area';
        wsPhotos.getCell(`D${currentRow + 1}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0284C7' } };

        wsPhotos.getCell(`C${currentRow + 2}`).value = 'Facility Name:';
        wsPhotos.getCell(`C${currentRow + 2}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF64748B' } };
        wsPhotos.getCell(`D${currentRow + 2}`).value = facName;
        wsPhotos.getCell(`D${currentRow + 2}`).font = { name: 'Arial', size: 9 };

        wsPhotos.getCell(`C${currentRow + 3}`).value = 'Department / Trade:';
        wsPhotos.getCell(`C${currentRow + 3}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF64748B' } };
        wsPhotos.getCell(`D${currentRow + 3}`).value = dept.name;
        wsPhotos.getCell(`D${currentRow + 3}`).font = { name: 'Arial', size: 9 };

        wsPhotos.getCell(`C${currentRow + 4}`).value = 'Remedial Priority:';
        wsPhotos.getCell(`C${currentRow + 4}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF64748B' } };
        wsPhotos.getCell(`D${currentRow + 4}`).value = `Priority ${item.priority} (${priority.timeframe})`;
        wsPhotos.getCell(`D${currentRow + 4}`).font = { name: 'Arial', size: 9, bold: true };

        wsPhotos.getCell(`C${currentRow + 5}`).value = 'Observed Defect:';
        wsPhotos.getCell(`C${currentRow + 5}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF64748B' } };
        wsPhotos.getCell(`D${currentRow + 5}`).value = item.defectDescription || 'None recorded.';
        wsPhotos.getCell(`D${currentRow + 5}`).font = { name: 'Arial', size: 8.5 };

        wsPhotos.getCell(`C${currentRow + 6}`).value = 'Remedial Estimate:';
        wsPhotos.getCell(`C${currentRow + 6}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF64748B' } };
        wsPhotos.getCell(`D${currentRow + 6}`).value = `$${(parseFloat(item.estimatedCost) || 0).toLocaleString()}`;
        wsPhotos.getCell(`D${currentRow + 6}`).font = { name: 'Arial', size: 10, bold: true };

        // Embed full photo
        if (photo.dataUrl) {
          try {
            const safeImg = await getSafeJpegImage(photo.dataUrl);
            if (safeImg && safeImg.base64) {
              const imageId = workbook.addImage({
                base64: safeImg.base64,
                extension: 'jpeg'
              });

              placeImageInBox(wsPhotos, imageId, safeImg, {
                col: 1, // column B (0-based)
                row: currentRow - 1,
                widthPx: colWidthToPx(PHOTO_COL_WIDTH),
                heightPx: PHOTO_BOX_HEIGHT_PX,
                padding: PHOTO_PADDING_PX
              });
            } else {
              photoBox.value = 'Photo unavailable';
              photoBox.font = { italic: true, color: { argb: 'FF94A3B8' } };
            }
          } catch (pErr) {
            console.warn('Failed embedding full photo into Excel Photo Log:', pErr);
          }
        }

        // One blank spacer row between photo blocks
        pRowIdx += PHOTO_BLOCK_ROWS + 1;
      }
    }
  }

  // Trigger Excel file download in browser
  const facilitySuffix = selectedFacility !== 'ALL' ? `_${selectedFacility.replace(/[^a-z0-9]/gi, '_')}` : '';
  const safeTitle = (facility.facilityName || facility.buildingName || 'FM_Condition_Survey')
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
  
  const buffer = await workbook.xlsx.writeBuffer();
  
  if (typeof window !== 'undefined') {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeTitle}${facilitySuffix}_audit_report.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }

  return buffer;
}
