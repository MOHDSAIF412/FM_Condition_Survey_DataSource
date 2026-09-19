import { describe, test, expect, vi } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: {}, isCloudConfigured: false }));
const saved = [];
vi.mock('../utils/fileSaver.js', () => ({ saveBlob: async (blob) => { saved.push(blob); } }));

const { standardLayout, clientLayout } = await import('../config/reportLayouts');
const { generateSurveyExcel } = await import('../utils/excelGenerator');
const { generateSurveyPDF } = await import('../utils/pdfGenerator');
const ExcelJS = (await import('exceljs')).default;

const survey = {
  id: 's1',
  facility: { facilityName: 'Stable Block A', address: 'Abu Dhabi' },
  signatures: {},
  items: [
    { id: 'i1', assetName: 'Roof sheet', location: 'Loft', department: 'Civil', priority: 1, defectDescription: 'Rusted', estimatedCost: 12500, quantity: 2, unit: 'nr', photos: [] },
    { id: 'i2', assetName: 'AC unit', location: 'Office', department: 'HVAC', priority: 3, defectDescription: 'Noisy fan', estimatedCost: 800, quantity: 1, unit: 'nr', photos: [] }
  ]
};

async function workbookFor(layout) {
  const buf = await generateSurveyExcel(survey, 'ALL', { layout });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

function allText(wb) {
  const out = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => out.push(String(c.text ?? c.value ?? '')))));
  return out.join(' | ');
}

async function pdfText(layout) {
  saved.length = 0;
  await generateSurveyPDF(survey, 'ALL', { layout });
  return new TextDecoder('latin1').decode(await saved[0].arrayBuffer());
}

describe('Excel follows the layout', () => {
  test('Standard keeps every sheet and shows costs', async () => {
    const wb = await workbookFor(standardLayout());
    expect(wb.worksheets.length).toBeGreaterThan(1);
    const text = allText(wb);
    expect(text).toContain('Est. Cost (AED)');
    expect(text).toContain('Rusted | 2 | 12500');
  });

  test('the client layout has no money anywhere', async () => {
    const text = allText(await workbookFor(clientLayout('c1')));
    expect(text).not.toMatch(/AED/);
    expect(text).not.toMatch(/12,?500|13,?300/);
    expect(text).toContain('Roof sheet');
  });

  test('sections that are off leave no sheet behind', async () => {
    const base = standardLayout();
    const only = { ...base, sections: { ...base.sections, cover: false, departmentCapex: false, prioritySchedule: false } };
    const names = (await workbookFor(only)).worksheets.map((w) => w.name);
    expect(names.some((n) => /Executive Summary/.test(n))).toBe(false);
    expect(names.length).toBe(1);
  });

  test('renamed and reordered columns reach the register', async () => {
    const l = { ...standardLayout(), columns: [
      { key: 'priority', visible: true, label: 'Urgency' },
      { key: 'name', visible: true, label: '' },
      { key: 'cost', visible: false, label: '' }
    ] };
    const text = allText(await workbookFor(l));
    expect(text).toContain('Urgency');
    expect(text).not.toContain('Est. Cost (AED)');
    expect(text).toContain('Urgency | Snag / Component Name | ');
    expect(text).toContain('P1 | Roof sheet | P3 | AC unit');   // nothing else in the register rows
  });
});

describe('PDF follows the layout', () => {
  test('Standard shows costs; the client layout does not', async () => {
    expect(await pdfText(standardLayout())).toMatch(/AED/);
    const client = await pdfText(clientLayout('c1'));
    expect(client).not.toMatch(/AED/);
    expect(client).toContain('Roof sheet');
  });

  test('the layout title and footer are printed', async () => {
    const text = await pdfText({ ...standardLayout(), title: 'Handover schedule', footerText: 'For ADEC only' });
    expect(text.toUpperCase()).toContain('HANDOVER SCHEDULE');
    expect(text).toContain('For ADEC only');
  });
});
