import { describe, test, expect, vi } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: {}, isCloudConfigured: false }));

const {
  standardLayout, clientLayout, normaliseReportsConfig, validateReportsConfig, resolveLayout, registerColumns,
  photosFor, editableColumns, describeReportChanges, defaultReportsConfig
} = await import('../config/reportLayouts');

const keys = (cols) => cols.map((c) => c.key);
const labels = (cols) => cols.map((c) => c.label);

describe('the Standard layout is today\'s report', () => {
  test('PDF register: same columns, labels and widths as before layouts', () => {
    const cols = registerColumns(standardLayout(), 'pdf');
    expect(labels(cols)).toEqual(['#', 'Snag / Component', 'Location / Room', 'Dept', 'Priority', 'Observations & Defects', 'Est. Cost']);
    expect(cols.reduce((n, c) => n + c.weight, 0)).toBe(170);   // exactly the A4 table width, so nothing is rescaled
  });

  test('Excel register: same columns and labels as before layouts', () => {
    expect(labels(registerColumns(standardLayout(), 'excel'))).toEqual([
      'Snag #', 'Evidence Photo', 'Snag Location / Room', 'Snag / Component Name', 'Department / Trade',
      'Priority', 'Observed Defects & Notes', 'Quantity', 'Est. Cost (AED)'
    ]);
  });

  test('nothing published: the default config resolves to Standard', () => {
    expect(resolveLayout(null, defaultReportsConfig())).toMatchObject({ id: 'standard', showCosts: true, photosPerSnag: 0 });
  });
});

describe('layout options', () => {
  test('hiding costs removes the cost column in both formats', () => {
    const l = { ...standardLayout(), showCosts: false };
    expect(keys(registerColumns(l, 'pdf'))).not.toContain('cost');
    expect(keys(registerColumns(l, 'excel'))).not.toContain('cost');
  });

  test('turning photos off drops the Excel photo column', () => {
    const l = { ...standardLayout(), sections: { ...standardLayout().sections, photos: false } };
    expect(keys(registerColumns(l, 'excel'))).not.toContain('photo');
  });

  test('chosen columns: order, names and visibility apply; Excel-only columns stay out of the PDF', () => {
    const l = {
      ...standardLayout(),
      columns: [
        { key: 'priority', visible: true, label: 'Urgency' },
        { key: 'photo', visible: true, label: '' },
        { key: 'name', visible: true, label: '' },
        { key: 'cost', visible: false, label: '' }
      ]
    };
    expect(labels(registerColumns(l, 'pdf'))).toEqual(['Urgency', 'Snag / Component']);
    expect(labels(registerColumns(l, 'excel'))).toEqual(['Urgency', 'Evidence Photo', 'Snag / Component Name']);
  });

  test('photos per snag', () => {
    const photos = [1, 2, 3, 4];
    expect(photosFor(standardLayout(), photos)).toEqual([1, 2, 3, 4]);
    expect(photosFor({ ...standardLayout(), photosPerSnag: 2 }, photos)).toEqual([1, 2]);
    expect(photosFor({ ...standardLayout(), sections: { ...standardLayout().sections, photos: false } }, photos)).toEqual([]);
  });

  test('the editable column list starts from today\'s columns, all shown', () => {
    const cols = editableColumns(standardLayout());
    expect(keys(cols)).toEqual(['number', 'photo', 'name', 'location', 'department', 'priority', 'defect', 'quantity', 'cost']);
    expect(cols.every((c) => c.visible)).toBe(true);
  });
});

describe('config safety', () => {
  test('Standard can never be removed or archived', () => {
    const norm = normaliseReportsConfig({ layouts: [{ ...standardLayout(), archived: true }, clientLayout('c1')] });
    expect(norm.layouts.find((l) => l.id === 'standard').archived).toBe(false);
    expect(normaliseReportsConfig({ layouts: [clientLayout('c1')] }).layouts[0].id).toBe('standard');
  });

  test('an archived or unknown default falls back to Standard', () => {
    expect(normaliseReportsConfig({ layouts: [{ ...clientLayout('c1'), archived: true }], defaultLayoutId: 'c1' }).defaultLayoutId).toBe('standard');
    expect(normaliseReportsConfig({ layouts: [], defaultLayoutId: 'nope' }).defaultLayoutId).toBe('standard');
  });

  test('a layout with nothing in it cannot be saved', () => {
    const empty = { ...clientLayout('c1'), sections: { cover: false, signatures: false, departmentCapex: false, prioritySchedule: false, register: false, photos: false } };
    expect(validateReportsConfig(normaliseReportsConfig({ layouts: [standardLayout(), empty] })).join()).toMatch(/no sections/);
  });

  test('two layouts cannot share a name', () => {
    const a = clientLayout('a'); const b = { ...clientLayout('b') };
    expect(validateReportsConfig(normaliseReportsConfig({ layouts: [standardLayout(), a, b] })).join()).toMatch(/same name/);
  });

  test('the publish summary says what changed', () => {
    const before = defaultReportsConfig();
    const after = { layouts: [standardLayout(), clientLayout('c1')], defaultLayoutId: 'c1' };
    expect(describeReportChanges(before, after)).toEqual(['New layout "Client report (no costs)"', 'Default layout is now "Client report (no costs)"']);
  });
});
