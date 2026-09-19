/**
 * Report layouts (Stage 4): what goes into the PDF and Excel reports.
 *
 * Stored as the versioned configuration kind 'reports' -- the same draft,
 * publish, history and rollback as the forms. Until a version is published,
 * the built-in Standard layout applies, and it reproduces the reports exactly
 * as they were before layouts existed.
 *
 * A layout chooses: which sections appear, the Snag Register's columns (which,
 * in what order, under what name), how many photos per snag, whether costs are
 * shown at all, the report title and footer, and whether it covers approved
 * facilities only.
 */
import { cachedPublishedConfig } from './configStore';

/**
 * Snag Register columns. `pdf` / `excel` give each format's own default label
 * and whether the column exists in that format; `weight` shares the PDF page
 * width. `cost` columns disappear when a layout hides costs.
 */
export const REGISTER_COLUMNS = [
  { key: 'number', label: '#', pdf: '#', excel: 'Snag #', weight: 8 },
  { key: 'photo', label: 'Evidence photo', excel: 'Evidence Photo', weight: 0, excelOnly: true, help: 'Excel only; the PDF has its own photo pages' },
  { key: 'name', label: 'Snag / Component', pdf: 'Snag / Component', excel: 'Snag / Component Name', weight: 34 },
  { key: 'location', label: 'Location / Room', pdf: 'Location / Room', excel: 'Snag Location / Room', weight: 32 },
  { key: 'department', label: 'Department / Trade', pdf: 'Dept', excel: 'Department / Trade', weight: 18 },
  { key: 'priority', label: 'Priority', pdf: 'Priority', excel: 'Priority', weight: 14 },
  { key: 'defect', label: 'Observations & defects', pdf: 'Observations & Defects', excel: 'Observed Defects & Notes', weight: 44 },
  { key: 'quantity', label: 'Quantity', pdf: 'Qty', excel: 'Quantity', weight: 12 },
  { key: 'cost', label: 'Estimated cost', pdf: 'Est. Cost', excel: 'Est. Cost (AED)', weight: 20, cost: true }
];
const COLUMN_BY_KEY = Object.fromEntries(REGISTER_COLUMNS.map((c) => [c.key, c]));

/** Today's column order in each format -- the Standard layout's. */
const DEFAULT_ORDER = {
  pdf: ['number', 'name', 'location', 'department', 'priority', 'defect', 'cost'],
  excel: ['number', 'photo', 'location', 'name', 'department', 'priority', 'defect', 'quantity', 'cost']
};

export const SECTIONS = [
  { key: 'cover', label: 'Cover & summary', help: 'PDF cover page; Excel "Executive Summary" sheet' },
  { key: 'signatures', label: 'Sign-off', help: 'Surveyor and client signatures on the cover' },
  { key: 'departmentCapex', label: 'Department breakdown', help: 'Snags (and costs) by department or trade' },
  { key: 'prioritySchedule', label: 'Priority schedule', help: 'Snags per priority with target timeframes' },
  { key: 'register', label: 'Snag register', help: 'The table of every snag' },
  { key: 'photos', label: 'Photos', help: 'PDF photo pages; Excel evidence photos' }
];

export const PHOTO_LIMITS = [
  { value: 0, label: 'All photos' },
  { value: 1, label: '1 per snag' },
  { value: 2, label: '2 per snag' },
  { value: 3, label: '3 per snag' }
];

export const DEFAULT_TITLE = { pdf: 'FM CONDITION & DEFECT SCHEDULE', excel: 'FACILITY CONDITION ASSESSMENT & SNAGGING AUDIT REPORT' };
export const DEFAULT_FOOTER = 'CONFIDENTIAL • OCS Facilities Management Condition Survey';

export function standardLayout() {
  return {
    id: 'standard',
    name: 'Standard report',
    description: 'Everything: cover, costs, department and priority breakdowns, register and photos.',
    builtIn: true,
    archived: false,
    title: '',
    footerText: '',
    showCosts: true,
    approvedOnly: false,
    photosPerSnag: 0,
    sections: Object.fromEntries(SECTIONS.map((s) => [s.key, true])),
    // null: each format keeps its own default columns and order (exactly today's report).
    columns: null
  };
}

/** A client-facing starting point: same report, no money anywhere, approved facilities only. */
export function clientLayout(id) {
  return {
    ...standardLayout(),
    id,
    builtIn: false,
    name: 'Client report (no costs)',
    description: 'For the client: no costs anywhere, approved facilities only.',
    showCosts: false,
    approvedOnly: true
  };
}

export function defaultReportsConfig() {
  return { layouts: [standardLayout()], defaultLayoutId: 'standard' };
}

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const text = (v, max) => String(v || '').slice(0, max);

function normaliseColumns(cols) {
  if (!Array.isArray(cols)) return null;
  const seen = new Set();
  const out = [];
  for (const c of cols) {
    if (!c || !COLUMN_BY_KEY[c.key] || seen.has(c.key)) continue;
    seen.add(c.key);
    out.push({ key: c.key, visible: c.visible !== false, label: text(c.label, 60).trim() });
  }
  // Columns added to the catalogue later appear, hidden, at the end.
  for (const c of REGISTER_COLUMNS) if (!seen.has(c.key)) out.push({ key: c.key, visible: false, label: '' });
  return out;
}

function normaliseLayout(l, index) {
  const base = standardLayout();
  return {
    id: text(l?.id, 60) || `layout_${index}`,
    name: text(l?.name, 80).trim() || `Layout ${index + 1}`,
    description: text(l?.description, 240),
    builtIn: l?.id === 'standard',
    archived: l?.id === 'standard' ? false : !!l?.archived,
    title: text(l?.title, 80),
    footerText: text(l?.footerText, 120),
    showCosts: bool(l?.showCosts, true),
    approvedOnly: bool(l?.approvedOnly, false),
    photosPerSnag: [0, 1, 2, 3].includes(Number(l?.photosPerSnag)) ? Number(l.photosPerSnag) : 0,
    sections: Object.fromEntries(SECTIONS.map((s) => [s.key, bool(l?.sections?.[s.key], base.sections[s.key])])),
    columns: normaliseColumns(l?.columns)
  };
}

export function normaliseReportsConfig(config) {
  const layouts = (Array.isArray(config?.layouts) ? config.layouts : []).map(normaliseLayout);
  if (!layouts.some((l) => l.id === 'standard')) layouts.unshift(standardLayout());
  const ids = new Set();
  const unique = layouts.filter((l) => (ids.has(l.id) ? false : ids.add(l.id)));
  const live = unique.filter((l) => !l.archived);
  const defaultLayoutId = live.some((l) => l.id === config?.defaultLayoutId) ? config.defaultLayoutId : 'standard';
  return { layouts: unique, defaultLayoutId };
}

/** Problems that stop a draft being saved, in plain words. */
export function validateReportsConfig(config) {
  const problems = [];
  for (const l of config.layouts) {
    if (l.archived) continue;
    const anyContent = ['cover', 'departmentCapex', 'prioritySchedule', 'register', 'photos'].some((k) => l.sections[k]);
    if (!anyContent) problems.push(`"${l.name}" has no sections turned on, so its report would be empty.`);
    if (l.sections.register && l.columns && !l.columns.some((c) => c.visible && !COLUMN_BY_KEY[c.key].excelOnly)) {
      problems.push(`"${l.name}" shows the snag register but no columns in it.`);
    }
  }
  const names = config.layouts.filter((l) => !l.archived).map((l) => l.name.toLowerCase());
  if (new Set(names).size !== names.length) problems.push('Two layouts have the same name.');
  return problems;
}

/** The layouts people can pick when generating a report. */
export function activeLayouts(config = cachedPublishedConfig('reports').config) {
  return normaliseReportsConfig(config).layouts.filter((l) => !l.archived);
}

/** A layout by id, else the published default, else Standard. Never throws. */
export function resolveLayout(layoutOrId = null, config = cachedPublishedConfig('reports').config) {
  if (layoutOrId && typeof layoutOrId === 'object') return normaliseLayout(layoutOrId, 0);
  const norm = normaliseReportsConfig(config);
  const live = norm.layouts.filter((l) => !l.archived);
  return live.find((l) => l.id === layoutOrId) || live.find((l) => l.id === norm.defaultLayoutId) || standardLayout();
}

/**
 * The Snag Register columns a format should draw for a layout, in order:
 * [{ key, label, weight }]. Cost columns are dropped when costs are hidden;
 * the photo column is dropped when photos are off.
 */
export function registerColumns(layout, format) {
  const l = layout || standardLayout();
  const list = l.columns
    ? l.columns.filter((c) => c.visible).map((c) => ({ key: c.key, label: c.label }))
    : DEFAULT_ORDER[format].map((key) => ({ key, label: '' }));
  return list
    .filter(({ key }) => (format === 'pdf' ? !COLUMN_BY_KEY[key].excelOnly : true))
    .filter(({ key }) => l.showCosts || !COLUMN_BY_KEY[key].cost)
    .filter(({ key }) => key !== 'photo' || l.sections.photos)
    .map(({ key, label }) => ({ key, label: label || COLUMN_BY_KEY[key][format] || COLUMN_BY_KEY[key].label, weight: COLUMN_BY_KEY[key].weight }));
}

/** The editable column list for the builder: the layout's own, or today's order to start from. */
export function editableColumns(layout) {
  if (layout.columns) return layout.columns;
  const order = ['number', 'photo', 'name', 'location', 'department', 'priority', 'defect', 'quantity', 'cost'];
  const shown = new Set([...DEFAULT_ORDER.pdf, 'photo', 'quantity']);
  return order.map((key) => ({ key, visible: shown.has(key), label: '' }));
}

export const columnInfo = (key) => COLUMN_BY_KEY[key];

/** How many of a snag's photos a layout includes. */
export function photosFor(layout, photos = []) {
  const l = layout || standardLayout();
  if (!l.sections.photos) return [];
  return l.photosPerSnag ? photos.slice(0, l.photosPerSnag) : photos;
}

/** One-line summaries of what changed, for the publish dialog. */
export function describeReportChanges(before, after) {
  const out = [];
  const b = new Map(normaliseReportsConfig(before).layouts.map((l) => [l.id, l]));
  for (const l of normaliseReportsConfig(after).layouts) {
    const old = b.get(l.id);
    if (!old) { out.push(`New layout "${l.name}"`); continue; }
    if (JSON.stringify(old) === JSON.stringify(l)) continue;
    if (!old.archived && l.archived) out.push(`Archived "${l.name}"`);
    else if (old.archived && !l.archived) out.push(`Restored "${l.name}"`);
    else out.push(`Changed "${l.name}"`);
  }
  if ((before?.defaultLayoutId || 'standard') !== (after?.defaultLayoutId || 'standard')) {
    const d = normaliseReportsConfig(after).layouts.find((l) => l.id === after.defaultLayoutId);
    out.push(`Default layout is now "${d?.name || after.defaultLayoutId}"`);
  }
  return out;
}
