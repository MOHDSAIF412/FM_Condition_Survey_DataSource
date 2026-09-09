import ExcelJS from 'exceljs';
import { PRIORITY_LEVELS, DEPARTMENTS, calculateSurveyStats, snagLabel } from '../types/survey.js';
import { OCS_LOGO_BASE64 } from '../assets/logoDataUrl.js';
import { saveBlob } from './fileSaver.js';
import { formatMoney, EXCEL_MONEY_FORMAT } from './currency.js';

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
 * Centre-crops a photo to an exact target aspect ratio ("cover").
 *
 * Excel cannot crop an embedded image, so to fill a cell edge-to-edge with no
 * empty margin the bitmap itself has to be cropped before it is embedded.
 * Scaling to fit instead ("contain") always leaves a gap whenever the photo's
 * ratio differs from the cell's -- which is nearly always, since the boxes are
 * ~1.5 and phone photos are 1.333 landscape or 0.75 portrait.
 *
 * The trade-off is deliberate: filling the box means the overflowing edges of
 * the photo are cut. Only ever use this on photographs; a logo or wordmark must
 * stay contain-fit or the brand gets sliced.
 *
 * @returns {Promise<{base64: string, width: number, height: number}|null>}
 */
async function coverCropToRatio(dataUrl, targetRatio, outWidth) {
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('photo could not be decoded for cropping'));
      el.src = url;
    });

    const natW = img.naturalWidth || 0;
    const natH = img.naturalHeight || 0;
    if (!natW || !natH) return null;

    // Largest centred rectangle of the source that already has targetRatio.
    const srcRatio = natW / natH;
    let sw, sh;
    if (srcRatio > targetRatio) {
      sh = natH;                      // too wide: trim left/right
      sw = Math.round(natH * targetRatio);
    } else {
      sw = natW;                      // too tall: trim top/bottom
      sh = Math.round(natW / targetRatio);
    }
    const sx = Math.round((natW - sw) / 2);
    const sy = Math.round((natH - sh) / 2);

    const outW = Math.max(1, Math.round(outWidth));
    const outH = Math.max(1, Math.round(outW / targetRatio));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

    return {
      base64: canvas.toDataURL('image/jpeg', 0.86).split('base64,')[1],
      width: outW,
      height: outH
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Places an image inside a cell box.
 *
 * fit: 'cover'   fills the box exactly, edge to edge, with zero offset. The
 *                caller must have already cropped the bitmap to the box ratio.
 * fit: 'contain' scales to fit and centres, preserving the whole image. Used
 *                for the logo, which must never be cropped.
 *
 * @param {object} ws       target worksheet
 * @param {number} imageId  id returned by workbook.addImage
 * @param {object} img      { width, height } natural pixel size
 * @param {object} box      { col, row, widthPx, heightPx, padding, fit }
 *                          col/row are 0-based anchor indices.
 */
function placeImageInBox(ws, imageId, img, box) {
  const fit = box.fit || 'contain';

  if (fit === 'cover') {
    // Fill the cell completely: no padding, no offset, no gap.
    ws.addImage(imageId, {
      tl: {
        nativeCol: box.col,
        nativeColOff: 0,
        nativeRow: box.row,
        nativeRowOff: 0
      },
      ext: { width: box.widthPx, height: box.heightPx },
      editAs: 'oneCell'
    });
    return;
  }

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
export async function generateSurveyExcel(input, selectedFacility = 'ALL') {
  // Accepts one survey or many. Passing several produces a single combined
  // workbook: shared summary and CapEx totals, with the Snag Register split
  // into a section per facility.
  const surveys = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const isCombined = surveys.length > 1;

  // Items stay grouped by their facility so the register can head each block
  // with the facility it belongs to, rather than merging everything into one
  // undifferentiated list.
  const groups = surveys.map((s) => {
    const all = s.items || [];
    return {
      facility: s.facility || {},
      items: selectedFacility === 'ALL'
        ? all
        : all.filter((i) => (i.location || 'General') === selectedFacility)
    };
  });

  const itemsToReport = groups.flatMap((g) => g.items);

  const stats = calculateSurveyStats(itemsToReport);
  const primarySurvey = surveys[0] || {};
  const facility = groups[0]?.facility || {};
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
      // contain, never cover: cropping a wordmark would slice the brand.
      placeImageInBox(wsExec, logoId, logo, {
        col: 4, // column E (0-based)
        row: LOGO_ROW - 1,
        widthPx: colWidthToPx(25) + colWidthToPx(25),
        heightPx: rowHeightToPx(LOGO_ROW_HEIGHT_PTS),
        padding: 6,
        fit: 'contain'
      });
    }
  } catch (err) {
    console.warn('Could not embed OCS logo in Excel:', err);
  }

  // Facility Metadata Section
  wsExec.getCell('B5').value = '1. FACILITY & SITE SPECIFICATIONS';
  wsExec.getCell('B5').font = { name: 'Arial', size: 11, bold: true, color: { argb: primaryNavy } };

  const metaFields = isCombined ? [
    ['Report Type', `Combined report covering ${groups.length} facilities`],
    ...groups.map((g, idx) => {
      const f = g.facility || {};
      const label = [f.facilityCode, f.facilityName || f.buildingName].filter(Boolean).join(' · ')
        || `Facility ${idx + 1}`;
      const cost = calculateSurveyStats(g.items || []).totalCost;
      return [label, `${(g.items || []).length} snags  •  ${formatMoney(cost)}`];
    }),
    ['Total Snags', String(itemsToReport.length)],
    ['Report Scope', selectedFacility === 'ALL' ? 'All locations across every facility listed' : `Locations matching ${selectedFacility}`]
  ] : [
    ['Facility Reference', facility.facilityCode || 'N/A'],
    ['Facility / Complex Name', facility.facilityName || facility.buildingName || 'N/A'],
    ['Primary Building Title', facility.buildingName || 'N/A'],
    ['Site Physical Address', facility.address || 'N/A'],
    ['Google Location Address', siteAddress],
    ['Google GPS Coordinates', gpsCoords],
    ['Google Maps Link', mapsUrl ? { text: 'Open Google Maps Pin', hyperlink: mapsUrl } : 'N/A'],
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
    ['Surveyor Sign-Off', primarySurvey.signatures?.surveyor?.signatureData ? 'Certified & Signed' : 'Pending Signature'],
    ['Client Sign-Off', primarySurvey.signatures?.client?.signatureData ? 'Certified & Signed' : 'Pending Signature']
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
    { label: 'TOTAL SNAGS AUDITED', val: stats.total, color: 'FF0F172A', sub: 'Cataloged building elements' },
    { label: 'TOTAL DEFECT PHOTOS', val: stats.totalPhotos, color: 'FF0284C7', sub: 'Attached photographic evidence' },
    { label: 'URGENT HAZARDS (P1)', val: stats.priorityCounts[1], color: 'FFDC2626', sub: 'Immediate life safety' },
    { label: 'REMEDIAL CAPEX BUDGET', val: formatMoney(stats.totalCost), color: 'FF0F172A', sub: 'Estimated remediation expenditure' }
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

  const deptHeaders = ['Department / Trade', 'Defect Count', 'Remedial Budget (AED)', 'CapEx Share (%)'];
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
    wsDept.getCell(`D${dRowIdx}`).numFmt = EXCEL_MONEY_FORMAT;
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
  wsDept.getCell(`D${dRowIdx}`).numFmt = EXCEL_MONEY_FORMAT;
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
  // D: Snag / Component Name
  // E: Department / Trade
  // F: Priority
  // G: Observed Defects & Notes
  // H: Quantity
  // I: Est. Cost (AED)
  // ==========================================

  const wsSnags = workbook.addWorksheet('Snag Register', {
    views: [{ showGridLines: true }]
  });

  // Evidence thumbnail box on the Snag Register: one cell, photo centred inside.
  const THUMB_COL_WIDTH = 24;          // ~173 px
  const THUMB_ROW_HEIGHT_PTS = 84;     // ~112 px
  const THUMB_PADDING_PX = 6;

  /**
   * One column per photo, sized to the snag carrying the most.
   *
   * Only `photos[0]` used to be embedded, so a snag photographed three times
   * showed one picture here while the PDF showed all three -- evidence quietly
   * missing from the client's spreadsheet. Capped so a single snag with dozens
   * of photos cannot produce an unreadable sheet.
   */
  const MAX_PHOTO_COLUMNS = 8;
  const photoColumnCount = Math.min(
    MAX_PHOTO_COLUMNS,
    Math.max(1, ...itemsToReport.map((i) => (i.photos || []).length), 1)
  );

  // 1-based column indices, since everything shifts with the photo count.
  const COL = {
    num: 1,
    photo: (k) => 2 + k,              // k is 0-based
    location: 2 + photoColumnCount,
    name: 3 + photoColumnCount,
    dept: 4 + photoColumnCount,
    priority: 5 + photoColumnCount,
    defect: 6 + photoColumnCount,
    qty: 7 + photoColumnCount,
    cost: 8 + photoColumnCount
  };
  const lastCol = COL.cost;

  wsSnags.columns = [
    { width: 8 },                                                  // Snag #
    ...Array.from({ length: photoColumnCount }, () => ({ width: THUMB_COL_WIDTH })),
    { width: 32 }, // Snag Location / Room
    { width: 34 }, // Snag / Component Name
    { width: 24 }, // Department / Trade
    { width: 14 }, // Priority
    { width: 48 }, // Observed Defects & Notes
    { width: 10 }, // Quantity
    { width: 18 }  // Est. Cost (AED)
  ];

  const letterFor = (n) => wsSnags.getColumn(n).letter;

  // Header banner
  wsSnags.mergeCells(`A1:${letterFor(lastCol)}1`);
  const snagBanner = wsSnags.getCell('A1');
  snagBanner.value = selectedFacility === 'ALL'
    ? 'FACILITY-WISE SNAG CONDITION & DEFECT SCHEDULE'
    : `SNAG DEFECT SCHEDULE — ${selectedFacility.toUpperCase()}`;
  snagBanner.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  snagBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
  snagBanner.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSnags.getRow(1).height = 28;

  // Clean Table Headers
  const snagHeaders = [
    'Snag #',
    ...Array.from({ length: photoColumnCount }, (_, k) =>
      photoColumnCount === 1 ? 'Evidence Photo' : `Evidence Photo ${k + 1}`),
    'Snag Location / Room',
    'Snag / Component Name',
    'Department / Trade',
    'Priority',
    'Observed Defects & Notes',
    'Quantity',
    'Est. Cost (AED)'
  ];

  const headerRow = wsSnags.getRow(3);
  headerRow.values = snagHeaders;
  headerRow.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.height = 24;

  for (let n = 1; n <= lastCol; n++) {
    const c = headerRow.getCell(n);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBlue } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }

  let snagRowIdx = 4;

  // One section per facility. A single-survey report produces exactly one
  // section, so this reads the same as before for the common case.
  for (const group of groups) {
    const groupFacility = group.facility || {};
    const groupItems = group.items || [];
    if (isCombined && !groupItems.length) continue;   // nothing to show for it

    const facName = groupFacility.facilityName || groupFacility.buildingName || 'Commercial Facility';
    const facRef = groupFacility.facilityCode ? groupFacility.facilityCode + ' \u2014 ' : '';
    const groupStats = calculateSurveyStats(groupItems);

    // Facility Section Header Row
    wsSnags.mergeCells(`A${snagRowIdx}:${letterFor(lastCol)}${snagRowIdx}`);
    const facBannerCell = wsSnags.getCell(`A${snagRowIdx}`);
    facBannerCell.value = `\u{1F3E2} FACILITY: ${facRef}${facName.toUpperCase()} (${groupItems.length} Audited Snags  \u2022  ${formatMoney(groupStats.totalCost)} Total Remedial CapEx)`;
    facBannerCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    facBannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: facilityHeaderBg } };
    facBannerCell.alignment = { vertical: 'middle', indent: 1 };
    wsSnags.getRow(snagRowIdx).height = 26;
    snagRowIdx++;

    // Populate snag rows and embed every photo
    for (let i = 0; i < groupItems.length; i++) {
      const item = groupItems[i];
      const dept = DEPARTMENTS[item.department] || DEPARTMENTS.GENERAL;
      const photos = item.photos || [];

      const row = wsSnags.getRow(snagRowIdx);
      row.getCell(COL.num).value = i + 1;
      row.getCell(COL.location).value = item.location || 'General Site Area';
      row.getCell(COL.name).value = snagLabel(item, i);
      row.getCell(COL.dept).value = dept.name;
      row.getCell(COL.priority).value = `P${item.priority}`;
      row.getCell(COL.defect).value = item.defectDescription || 'No defect observed.';
      row.getCell(COL.qty).value = item.quantity || 1;
      row.getCell(COL.cost).value = parseFloat(item.estimatedCost) || 0;

      row.font = { name: 'Arial', size: 9 };
      row.height = THUMB_ROW_HEIGHT_PTS; // Photo box height

      row.getCell(COL.num).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(COL.num).font = { bold: true };
      row.getCell(COL.location).alignment = { vertical: 'middle' };
      row.getCell(COL.location).font = { bold: true };
      row.getCell(COL.name).alignment = { vertical: 'middle', wrapText: true };
      row.getCell(COL.name).font = { bold: true };
      row.getCell(COL.dept).alignment = { vertical: 'middle' };
      row.getCell(COL.priority).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(COL.priority).font = {
        bold: true,
        color: { argb: item.priority === 1 ? 'FFDC2626' : item.priority === 2 ? 'FFF97316' : 'FF0F172A' }
      };
      row.getCell(COL.defect).alignment = { vertical: 'middle', wrapText: true };
      row.getCell(COL.qty).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(COL.cost).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(COL.cost).numFmt = EXCEL_MONEY_FORMAT;
      row.getCell(COL.cost).font = { bold: true };

      const cellW = colWidthToPx(THUMB_COL_WIDTH);
      const cellH = rowHeightToPx(THUMB_ROW_HEIGHT_PTS);

      for (let k = 0; k < photoColumnCount; k++) {
        const colIndex = COL.photo(k);
        const cell = row.getCell(colIndex);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };

        const photo = photos[k];
        if (!photo || !photo.dataUrl) {
          // Only label the first box, so a snag with one photo does not read
          // as a row of "No photo" cells.
          if (k === 0 && !photos.length) {
            cell.value = 'No photo';
            cell.font = { italic: true, color: { argb: 'FF94A3B8' } };
          }
          continue;
        }

        try {
          // Crop the bitmap to the cell's own ratio so it fills it exactly.
          let cropped = null;
          try {
            cropped = await coverCropToRatio(photo.dataUrl, cellW / cellH, cellW * 2);
          } catch (cropErr) {
            console.warn('Thumbnail crop failed, falling back to uncropped embed:', cropErr);
          }

          if (cropped && cropped.base64) {
            const imageId = workbook.addImage({ base64: cropped.base64, extension: 'jpeg' });
            placeImageInBox(wsSnags, imageId, cropped, {
              col: colIndex - 1,          // placeImageInBox takes a 0-based column
              row: snagRowIdx - 1,
              widthPx: cellW,
              heightPx: cellH,
              fit: 'cover'
            });
          } else {
            // Cropping failed (decode error, huge image, etc) -- fall back to the
            // uncropped photo, contain-fit, rather than dropping it silently.
            const safe = await getSafeJpegImage(photo.dataUrl);
            if (safe && safe.base64) {
              const imageId = workbook.addImage({ base64: safe.base64, extension: 'jpeg' });
              placeImageInBox(wsSnags, imageId, safe, {
                col: colIndex - 1,
                row: snagRowIdx - 1,
                widthPx: cellW,
                heightPx: cellH,
                fit: 'contain'
              });
            } else {
              cell.value = 'Photo unavailable';
              cell.font = { italic: true, color: { argb: 'FF94A3B8' } };
            }
          }
        } catch (imgErr) {
          console.warn('Failed embedding thumbnail into Excel:', imgErr);
        }
      }

      snagRowIdx++;
    }

    snagRowIdx++;   // blank spacer between facilities
  }

  // Trigger Excel file download in browser
  const facilitySuffix = selectedFacility !== 'ALL' ? `_${selectedFacility.replace(/[^a-z0-9]/gi, '_')}` : '';
  const safeTitle = isCombined
    ? `all_facilities_${surveys.length}`
    : (facility.facilityName || facility.buildingName || 'FM_Condition_Survey')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
  
  const buffer = await workbook.xlsx.writeBuffer();
  
  if (typeof window !== 'undefined') {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await saveBlob(blob, `${safeTitle}${facilitySuffix}_audit_report.xlsx`, 'FM Condition Survey Report');
  }

  return buffer;
}
