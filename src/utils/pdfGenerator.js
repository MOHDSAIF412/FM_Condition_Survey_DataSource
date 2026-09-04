import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { PRIORITY_LEVELS, DEPARTMENTS, calculateSurveyStats } from '../types/survey';
import { OCS_LOGO_BASE64 } from '../assets/logoDataUrl';
import { saveBlob } from './fileSaver';

/**
 * Converts image data (including SVG data URLs) to clean JPEG/PNG data URL via an offscreen canvas
 * before embedding into jsPDF to guarantee valid raster format.
 */
async function getSafeImageDataUrl(dataUrl) {
  if (!dataUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 600;
        canvas.height = img.naturalHeight || 400;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        console.warn('Canvas conversion failed, fallback to raw dataUrl', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = dataUrl;
  });
}

/**
 * Generates an executive Facilities Management condition assessment report
 */
export async function generateSurveyPDF(survey, selectedFacility = 'ALL') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  const allItems = survey.items || [];
  const itemsToReport = selectedFacility === 'ALL'
    ? allItems
    : allItems.filter((i) => (i.location || 'General') === selectedFacility);

  const stats = calculateSurveyStats(itemsToReport);
  const facility = survey.facility || {};
  const googleLoc = facility.googleLocation || {};

  // Common Header & Footer helper
  const renderHeader = (title) => {
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 18, 'F');

    // Subtle OCS white badge in header
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pageWidth - 36, 2.5, 16, 13, 1, 1, 'F');
      doc.addImage(OCS_LOGO_BASE64, 'PNG', pageWidth - 35, 3.5, 14, 11);
    } catch (e) {}

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    const facilityHeader = facility.facilityName || facility.buildingName || 'Facility Condition Audit';
    doc.text(doc.splitTextToSize(facilityHeader.toUpperCase(), pageWidth - 90)[0], 20, 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(title, pageWidth - 40, 11, { align: 'right' });
  };

  const renderFooter = (pageNo, totalPages) => {
    doc.setFillColor(248, 250, 252);
    doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(20, pageHeight - 12, pageWidth - 20, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('CONFIDENTIAL • OCS Facilities Management Condition Survey', 20, pageHeight - 5);
    doc.text(`Page ${pageNo} of ${totalPages}`, pageWidth - 20, pageHeight - 5, { align: 'right' });
  };

  // ==========================================
  // PAGE 1: EXECUTIVE COVER PAGE
  // ==========================================
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 85, 'F');

  // OCS Company Logo on Cover
  try {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - 58, 14, 38, 18, 2, 2, 'F');
    doc.addImage(OCS_LOGO_BASE64, 'PNG', pageWidth - 55, 15.5, 32, 15);
  } catch (logoErr) {
    console.warn('Failed embedding OCS logo on cover:', logoErr);
  }

  // Badge
  doc.setFillColor(2, 132, 199); // sky-600
  doc.roundedRect(20, 16, 85, 7, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('FM CONDITION & DEFECT SCHEDULE', 24, 21);

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  const facilityTitle = facility.facilityName || facility.buildingName || 'Facilities Condition Audit';
  doc.text(doc.splitTextToSize(facilityTitle, pageWidth - 80), 20, 36);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(186, 230, 253);
  doc.text(facility.buildingName || 'Condition Assessment Report', 20, 47);

  // Google Location Link on Cover
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(20, 55, pageWidth - 40, 20, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(52, 211, 153);
  doc.text('GOOGLE LOCATION & GPS PIN:', 24, 62);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  const locLine = `${googleLoc.address || facility.address || 'Site Address'} (GPS: ${googleLoc.latitude || 'N/A'}, ${googleLoc.longitude || 'N/A'})`;
  doc.text(doc.splitTextToSize(locLine, pageWidth - 95), 24, 69);

  if (googleLoc.mapsUrl) {
    doc.setTextColor(56, 189, 248);
    doc.setFont('helvetica', 'bold');
    doc.textWithLink('[Open Google Maps]', pageWidth - 55, 69, { url: googleLoc.mapsUrl });
  }

  // Facility Metadata Grid
  let curY = 97;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FACILITY & AUDIT SPECIFICATION', 20, curY);

  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(0.8);
  doc.line(20, curY + 2, 45, curY + 2);

  curY += 10;
  const metaBoxY = curY;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, metaBoxY, pageWidth - 40, 45, 3, 3, 'FD');

  const col1X = 26;
  const col2X = 110;
  let rowY = metaBoxY + 8;

  const printMeta = (label, val, x, y) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(label, x, y);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(val || 'N/A'), x + 35, y);
  };

  printMeta('Building Code:', facility.buildingCode, col1X, rowY);
  printMeta('Lead Inspector:', facility.surveyorName, col2X, rowY);
  rowY += 8;
  printMeta('Inspection Date:', facility.surveyDate, col1X, rowY);
  printMeta('Consultancy:', facility.surveyorCompany, col2X, rowY);
  rowY += 8;
  printMeta('Gross Int. Area:', facility.grossInternalArea, col1X, rowY);
  printMeta('Client / Owner:', facility.clientName, col2X, rowY);
  rowY += 8;
  printMeta('Building Levels:', facility.floorsCount, col1X, rowY);
  printMeta('Facility Mgr:', facility.facilityManager, col2X, rowY);
  rowY += 8;
  printMeta('Weather / Temp:', facility.weatherCondition, col1X, rowY);
  printMeta('Total Snags:', `${stats.total} Assets`, col2X, rowY);

  // Executive KPI summary cards
  curY = metaBoxY + 54;
  const kpiWidth = (pageWidth - 40 - 9) / 4;

  const drawKpiCard = (x, y, label, val, sub, color) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, kpiWidth, 26, 2, 2, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(label, x + 4, y + 6);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(String(val), x + 4, y + 16);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(sub, x + 4, y + 22);
  };

  drawKpiCard(20, curY, 'AUDITED ASSETS', stats.total, 'Snag Elements', [15, 23, 42]);
  drawKpiCard(20 + kpiWidth + 3, curY, 'ATTACHED PHOTOS', stats.totalPhotos, 'Defect Evidence', [2, 132, 199]);
  drawKpiCard(20 + (kpiWidth + 3) * 2, curY, 'URGENT HAZARDS', stats.priorityCounts[1], 'Priority 1 Life Safety', [220, 38, 38]);
  drawKpiCard(20 + (kpiWidth + 3) * 3, curY, 'REMEDIAL CAPEX', `$${stats.totalCost.toLocaleString()}`, 'Estimated Budget', [15, 23, 42]);

  // Scope notes block
  curY += 34;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SURVEY SCOPE & EXECUTIVE METHODOLOGY', 20, curY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const scopeText = facility.scopeNotes || 'Visual condition and snagging survey conducted across all accessible structural, mechanical, electrical, and life-safety building components.';
  doc.text(doc.splitTextToSize(scopeText, pageWidth - 40), 20, curY + 6);

  // Digital Signatures
  curY += 26;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FORMAL STAKEHOLDER SIGN-OFF', 20, curY);

  const sigBoxW = (pageWidth - 40 - 6) / 2;
  const sigY = curY + 5;

  // Surveyor Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, sigY, sigBoxW, 30, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Lead Surveyor: ${survey.signatures?.surveyor?.name || facility.surveyorName || 'N/A'}`, 24, sigY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${survey.signatures?.surveyor?.date || facility.surveyDate || ''}`, 24, sigY + 11);

  if (survey.signatures?.surveyor?.signatureData) {
    try {
      doc.addImage(survey.signatures.surveyor.signatureData, 'PNG', 24, sigY + 14, 50, 13);
    } catch (e) {
      console.warn('Could not embed surveyor signature', e);
    }
  }

  // Client Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20 + sigBoxW + 6, sigY, sigBoxW, 30, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Client / FM: ${survey.signatures?.client?.name || facility.clientName || 'N/A'}`, 20 + sigBoxW + 10, sigY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${survey.signatures?.client?.date || facility.surveyDate || ''}`, 20 + sigBoxW + 10, sigY + 11);

  if (survey.signatures?.client?.signatureData) {
    try {
      doc.addImage(survey.signatures.client.signatureData, 'PNG', 20 + sigBoxW + 10, sigY + 14, 50, 13);
    } catch (e) {
      console.warn('Could not embed client signature', e);
    }
  }


  // ==========================================
  // PAGE 2: DEPARTMENTAL CAPEX & PRIORITY MATRIX
  // ==========================================
  doc.addPage();
  renderHeader('DEPARTMENTAL ALLOCATION & PRIORITY SCHEDULE');

  let currentY = 28;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('1. REMEDIAL CAPEX BY MAINTENANCE DEPARTMENT / TRADE', 20, currentY);

  // Department Table
  const deptTableRows = Object.keys(DEPARTMENTS).map((dKey) => {
    const dept = DEPARTMENTS[dKey];
    const dStat = stats.departmentStats[dKey] || { count: 0, cost: 0 };
    const pct = stats.totalCost > 0 ? ((dStat.cost / stats.totalCost) * 100).toFixed(1) : '0.0';
    return [
      dept.name,
      dStat.count,
      `$${dStat.cost.toLocaleString()}`,
      `${pct}%`
    ];
  });

  deptTableRows.push([
    'TOTAL (All Departments Combined)',
    stats.total,
    `$${stats.totalCost.toLocaleString()}`,
    '100.0%'
  ]);

  doc.autoTable({
    startY: currentY + 4,
    head: [['Maintenance Department / Trade', 'Defect Count', 'Remedial Budget ($)', 'CapEx Share (%)']],
    body: deptTableRows,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 70 },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'right', fontStyle: 'bold', cellWidth: 40 },
      3: { halign: 'center', cellWidth: 30 }
    },
    didParseCell: function(data) {
      if (data.row.index === deptTableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
    margin: { top: 26, left: 20, right: 20, bottom: 18 },
    didDrawPage: (data) => {
      if (data.pageNumber > 2) renderHeader('DEPARTMENTAL ALLOCATION & PRIORITY SCHEDULE (CONT.)');
    }
  });

  currentY = doc.lastAutoTable.finalY + 12;

  // Priority Schedule Table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. REMEDIATION PRIORITY & TIMEFRAME SCHEDULE', 20, currentY);

  const priorityRows = [
    ['Priority 1 (Urgent)', 'Immediate / within 1-3 months', 'Life safety, health, statutory compliance, or operational breakdown.', stats.priorityCounts[1]],
    ['Priority 2 (Essential)', 'Within 1-2 years', 'Essential repairs to prevent secondary structural or system degradation.', stats.priorityCounts[2]],
    ['Priority 3 (Desirable)', 'Within 3-5 years', 'Desirable refurbishment to optimize energy efficiency or aesthetics.', stats.priorityCounts[3]],
    ['Priority 4 (Long Term)', '5+ years', 'Routine long-term lifecycle replacements and preventative monitoring.', stats.priorityCounts[4]]
  ];

  doc.autoTable({
    startY: currentY + 4,
    head: [['Priority Level', 'Target Timeframe', 'Standard Urgency Criteria', 'Items']],
    body: priorityRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38 },
      1: { cellWidth: 42, fontStyle: 'bold' },
      2: { cellWidth: 75 },
      3: { halign: 'center', cellWidth: 15, fontStyle: 'bold' }
    },
    didParseCell: function(data) {
      if (data.section === 'body') {
        if (data.row.index === 0 && data.column.index === 0) data.cell.styles.textColor = [220, 38, 38];
        if (data.row.index === 1 && data.column.index === 0) data.cell.styles.textColor = [234, 88, 12];
      }
    },
    margin: { top: 26, left: 20, right: 20, bottom: 18 },
    didDrawPage: (data) => {
      if (data.pageNumber > 2) renderHeader('DEPARTMENTAL ALLOCATION & PRIORITY SCHEDULE (CONT.)');
    }
  });


  // ==========================================
  // PAGE 3: DETAILED ASSET AUDIT SCHEDULE (FACILITY-WISE)
  // ==========================================
  doc.addPage();
  const scheduleTitle = selectedFacility === 'ALL'
    ? 'DETAILED ASSET AUDIT SCHEDULE'
    : `AUDIT SCHEDULE — ${selectedFacility.toUpperCase()}`;
  const assetSchedulePage = doc.internal.getNumberOfPages();
  renderHeader(scheduleTitle);

  const assetTableRows = itemsToReport.map((item, index) => {
    const deptName = (DEPARTMENTS[item.department]?.name || 'General').split('&')[0];
    return [
      String(index + 1),
      item.assetName || 'Unnamed Asset',
      item.location || 'General Site Area',
      deptName,
      `P${item.priority}`,
      item.defectDescription || 'No significant defect identified.',
      `$${(parseFloat(item.estimatedCost) || 0).toLocaleString()}`
    ];
  });

  doc.autoTable({
    startY: 26,
    head: [['#', 'Asset / Component', 'Location / Room', 'Dept', 'Priority', 'Observations & Defects', 'Est. Cost']],
    body: assetTableRows,
    theme: 'grid',
    headStyles: { fillColor: [12, 74, 110], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59], cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 34, fontStyle: 'bold' },
      2: { cellWidth: 32, fontStyle: 'bold' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 44 },
      6: { cellWidth: 20, halign: 'right', fontStyle: 'bold' }
    },
    didParseCell: function(data) {
      if (data.section === 'body') {
        if (data.column.index === 4) {
          const text = data.cell.text.join('');
          if (text.includes('P1')) data.cell.styles.textColor = [220, 38, 38];
          if (text.includes('P2')) data.cell.styles.textColor = [249, 115, 22];
        }
      }
    },
    margin: { top: 26, left: 20, right: 20, bottom: 18 },
    didDrawPage: (data) => {
      if (data.pageNumber > assetSchedulePage) {
        renderHeader(scheduleTitle + ' (CONT.)');
      }
    }
  });


  // ==========================================
  // PAGE 4: DEFECT PHOTO EVIDENCE LOG
  // ==========================================
  const itemsWithPhotos = itemsToReport.filter((item) => item.photos && item.photos.length > 0);

  if (itemsWithPhotos.length > 0) {
    doc.addPage();
    renderHeader('DEFECT PHOTOGRAPHIC EVIDENCE LOG');

    let photoY = 28;

    for (let i = 0; i < itemsWithPhotos.length; i++) {
      const item = itemsWithPhotos[i];
      const deptName = DEPARTMENTS[item.department]?.name || 'General FM';
      const totalSnagPhotos = item.photos.length;

      for (let p = 0; p < totalSnagPhotos; p++) {
        const photo = item.photos[p];

        if (photoY + 75 > pageHeight - 20) {
          doc.addPage();
          renderHeader('DEFECT PHOTOGRAPHIC EVIDENCE LOG (CONT.)');
          photoY = 28;
        }

        const safeDataUrl = await getSafeImageDataUrl(photo.dataUrl);

        // Photo card container
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(20, photoY, pageWidth - 40, 68, 2, 2, 'FD');

        if (safeDataUrl) {
          try {
            doc.addImage(safeDataUrl, 'JPEG', 24, photoY + 5, 80, 58);
          } catch (imgErr) {
            console.warn('Failed embedding image in PDF:', imgErr);
          }
        }

        // Details next to photo
        const infoX = 110;
        const titleWidth = pageWidth - infoX - 25;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);

        // Step the title down a size until it fits the card, then clip it.
        let assetTitle = item.assetName || 'Unnamed Asset';
        let titleSize = 10;
        doc.setFontSize(titleSize);
        while (titleSize > 8 && doc.getTextWidth(assetTitle) > titleWidth) {
          titleSize -= 0.5;
          doc.setFontSize(titleSize);
        }
        if (doc.getTextWidth(assetTitle) > titleWidth) {
          assetTitle = doc.splitTextToSize(assetTitle, titleWidth)[0];
        }
        doc.text(assetTitle, infoX, photoY + 11);

        // Multi-photo count & caption
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(2, 132, 199);
        const photoLabel = `Photo ${p + 1} of ${totalSnagPhotos}: ${photo.caption || 'Defect Evidence'}`;
        doc.text(doc.splitTextToSize(photoLabel, pageWidth - infoX - 25), infoX, photoY + 18);

        // Location & Google GPS
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        const infoWidth = pageWidth - infoX - 25;
        const locDetail = `Dept: ${deptName} • Loc: ${item.location || 'N/A'}`;
        doc.text(doc.splitTextToSize(locDetail, infoWidth)[0], infoX, photoY + 25);

        // Google GPS pin
        if (googleLoc.latitude) {
          doc.setFontSize(7);
          doc.setTextColor(5, 150, 105); // emerald-600
          const gpsLine = `Google GPS: ${googleLoc.latitude}, ${googleLoc.longitude}`;
          doc.text(doc.splitTextToSize(gpsLine, infoWidth)[0], infoX, photoY + 31);
        }

        // Priority Badge
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(
          item.priority === 1 ? 220 : item.priority === 2 ? 234 : 30,
          item.priority === 1 ? 38 : item.priority === 2 ? 88 : 41,
          item.priority === 1 ? 38 : item.priority === 2 ? 12 : 59
        );
        const urgencyLine = `Remedial Urgency: Priority ${item.priority} (${PRIORITY_LEVELS[item.priority]?.timeframe})`;
        doc.text(doc.splitTextToSize(urgencyLine, infoWidth)[0], infoX, photoY + 38);

        // Defect notes
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text('Observed Defect:', infoX, photoY + 45);
        const splitDefect = doc
          .splitTextToSize(item.defectDescription || 'None recorded', infoWidth)
          .slice(0, 4);
        doc.text(splitDefect, infoX, photoY + 50);

        // Action & Cost
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Remedial Estimate: $${(parseFloat(item.estimatedCost) || 0).toLocaleString()}`, infoX, photoY + 63);

        photoY += 73;
      }
    }
  }

  // Stamp "Page X of Y" on every page once the total is known
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    renderFooter(p, totalPages);
  }

  // Save the PDF
  const facilitySuffix = selectedFacility !== 'ALL' ? `_${selectedFacility.replace(/[^a-z0-9]/gi, '_')}` : '';
  const safeFilename = (facility.facilityName || facility.buildingName || 'FM_Condition_Survey')
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'fm_condition_survey';
  const pdfName = `${safeFilename}${facilitySuffix}_audit_report.pdf`;
  await saveBlob(doc.output('blob'), pdfName, 'FM Condition Survey Report');
  return pdfName;
}
