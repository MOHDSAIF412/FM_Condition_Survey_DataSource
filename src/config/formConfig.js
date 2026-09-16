/**
 * The form configuration: sections, fields, dropdown options and rules for the
 * two things a surveyor fills in -- a facility and a snag.
 *
 * Shape (stored whole as one version in `app_config_versions`, kind 'forms'):
 *
 *   { schemaVersion, sections: [...], fields: [...], rules: [...] }
 *
 * SYSTEM sections and fields are the ones already built into the app. They map
 * to real database columns and drive calculations (priority -> CapEx scoring),
 * so they can be renamed and, where safe, hidden -- never deleted or retyped.
 * normaliseFormsConfig() puts them back if a stored config lacks them, so no
 * configuration can remove a field the app depends on.
 *
 * CUSTOM fields are the ones an administrator adds. Their values live in
 * `facility.custom` (facility) and `item.customValues` (snag). Archiving a
 * field or option hides it from new work but never erases recorded values.
 */
import { FIELD_TYPES, isEmptyValue } from './fieldTypes';

export const FORMS_SCHEMA_VERSION = 1;

export const SCOPES = {
  facility: { id: 'facility', label: 'Facility' },
  snag: { id: 'snag', label: 'Snag' }
};

export const SYSTEM_SECTIONS = [
  { id: 'facility_identification', scope: 'facility', label: 'Facility & Complex Identification', order: 0 },
  { id: 'facility_location', scope: 'facility', label: 'Google Location & GPS Coordinates', order: 1 },
  { id: 'facility_scope', scope: 'facility', label: 'Survey Scope & Methodology', order: 2 },
  { id: 'snag_details', scope: 'snag', label: 'Snag Details', order: 0 },
  // Photos stay last on the snag card; sections an administrator adds sit above it.
  { id: 'snag_photos', scope: 'snag', label: 'Photos & Evidence', order: 900 }
];

/**
 * lockVisible: the app cannot work without it on screen.
 * `type` here only describes the built-in control, for the builder's display.
 */
export const SYSTEM_FIELDS = [
  { key: 'facilityName', scope: 'facility', sectionId: 'facility_identification', label: 'Facilities Name / Complex Name', type: 'text', required: true, lockVisible: true },
  { key: 'facilityType', scope: 'facility', sectionId: 'facility_identification', label: 'Facility Type', type: 'dropdown' },
  { key: 'grossInternalArea', scope: 'facility', sectionId: 'facility_identification', label: 'Gross Internal Area (GIA)', type: 'text' },
  { key: 'address', scope: 'facility', sectionId: 'facility_location', label: 'Google Maps Location Address', type: 'text' },
  { key: 'latitude', scope: 'facility', sectionId: 'facility_location', label: 'GPS Latitude', type: 'text' },
  { key: 'longitude', scope: 'facility', sectionId: 'facility_location', label: 'GPS Longitude', type: 'text' },
  { key: 'scopeNotes', scope: 'facility', sectionId: 'facility_scope', label: 'Audit Scope Description', type: 'textarea' },

  { key: 'location', scope: 'snag', sectionId: 'snag_details', label: 'Snag Location / Room / Area', type: 'text', lockVisible: true },
  { key: 'department', scope: 'snag', sectionId: 'snag_details', label: 'Department / Trade', type: 'dropdown', lockVisible: true },
  { key: 'priority', scope: 'snag', sectionId: 'snag_details', label: 'Remedial Priority (1 - 4)', type: 'dropdown', lockVisible: true },
  { key: 'defectDescription', scope: 'snag', sectionId: 'snag_details', label: 'Observed Defects & Condition Notes', type: 'textarea', lockVisible: true },
  { key: 'estimatedCost', scope: 'snag', sectionId: 'snag_details', label: 'Estimated Remediation Cost (AED)', type: 'number' },
  { key: 'quantity', scope: 'snag', sectionId: 'snag_details', label: 'Quantity', type: 'number' },
  { key: 'photos', scope: 'snag', sectionId: 'snag_photos', label: 'Photos', type: 'photo', lockVisible: true }
];

const systemFieldId = (f) => `sys_${f.scope}_${f.key}`;
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function defaultFormsConfig() {
  return normaliseFormsConfig({ sections: [], fields: [], rules: [] });
}

const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

function normaliseOption(o = {}, i = 0) {
  const label = String(o.label ?? o.value ?? '').trim();
  return {
    id: o.id || newId('opt'),
    value: String(o.value ?? label).trim() || label,
    label,
    archived: !!o.archived,
    order: Number.isFinite(o.order) ? o.order : i
  };
}

function normaliseField(f = {}, i = 0) {
  const type = FIELD_TYPES[f.type] ? f.type : 'text';
  return {
    id: f.id || newId('fld'),
    key: String(f.key || '').trim(),
    scope: SCOPES[f.scope] ? f.scope : 'facility',
    sectionId: f.sectionId || '',
    label: String(f.label || '').trim(),
    type,
    helpText: String(f.helpText || ''),
    placeholder: String(f.placeholder || ''),
    required: !!f.required,
    hidden: !!f.hidden,
    archived: !!f.archived,
    system: false,
    web: bool(f.web, true),
    mobile: bool(f.mobile, true),
    pdf: bool(f.pdf, true),
    excel: bool(f.excel, true),
    order: Number.isFinite(f.order) ? f.order : i,
    options: FIELD_TYPES[type].hasOptions ? (f.options || []).map(normaliseOption) : [],
    publishedOnce: !!f.publishedOnce
  };
}

/**
 * A complete, safe configuration from whatever was stored: system sections and
 * fields restored and locked, unknown values replaced, orders made contiguous.
 */
export function normaliseFormsConfig(raw = {}) {
  const storedSections = Array.isArray(raw.sections) ? raw.sections : [];
  const storedFields = Array.isArray(raw.fields) ? raw.fields : [];

  const sections = [];
  const seenSection = new Set();
  SYSTEM_SECTIONS.forEach((sys) => {
    const stored = storedSections.find((s) => s.id === sys.id) || {};
    // Built-in sections keep their place: the screens that draw them are fixed.
    sections.push({
      id: sys.id, scope: sys.scope, system: true, archived: false,
      label: String(stored.label || '').trim() || sys.label,
      defaultLabel: sys.label,
      order: sys.order
    });
    seenSection.add(sys.id);
  });
  storedSections.forEach((s, i) => {
    if (!s || seenSection.has(s.id) || !SCOPES[s.scope]) return;
    seenSection.add(s.id);
    sections.push({
      id: s.id || newId('sec'), scope: s.scope, system: false, archived: !!s.archived,
      label: String(s.label || '').trim() || 'Untitled section',
      // Custom sections sit between the built-in ones and anything fixed at the end.
      order: Math.min(899, Math.max(100, Number.isFinite(s.order) ? s.order : 100 + i))
    });
  });

  const fields = [];
  const seenField = new Set();
  SYSTEM_FIELDS.forEach((sys, i) => {
    const id = systemFieldId(sys);
    const stored = storedFields.find((f) => f.id === id) || {};
    fields.push({
      ...normaliseField({}, i),
      id, key: sys.key, scope: sys.scope, sectionId: sys.sectionId, type: sys.type, system: true,
      label: String(stored.label || '').trim() || sys.label,
      defaultLabel: sys.label,
      helpText: String(stored.helpText || ''),
      required: !!sys.required,
      lockRequired: true,
      lockVisible: !!sys.lockVisible,
      hidden: sys.lockVisible ? false : !!stored.hidden,
      web: sys.lockVisible ? true : bool(stored.web, true),
      mobile: sys.lockVisible ? true : bool(stored.mobile, true),
      pdf: bool(stored.pdf, true),
      excel: bool(stored.excel, true),
      order: i,
      options: [],
      publishedOnce: true
    });
    seenField.add(id);
  });
  storedFields.forEach((f, i) => {
    if (!f || seenField.has(f.id) || String(f.id || '').startsWith('sys_')) return;
    const field = normaliseField(f, 100 + i);
    seenField.add(field.id);
    // A field whose section no longer exists falls back to the first section of its scope.
    if (!sections.some((s) => s.id === field.sectionId && s.scope === field.scope)) {
      field.sectionId = sections.find((s) => s.scope === field.scope)?.id || '';
    }
    fields.push(field);
  });

  const rules = (Array.isArray(raw.rules) ? raw.rules : []).map((r) => ({
    id: r.id || newId('rule'),
    name: String(r.name || '').trim(),
    scope: SCOPES[r.scope] ? r.scope : 'snag',
    enabled: r.enabled !== false,
    archived: !!r.archived,
    match: r.match === 'any' ? 'any' : 'all',
    conditions: (r.conditions || []).map((c) => ({ fieldKey: c.fieldKey || '', op: c.op || 'equals', value: c.value ?? '' })),
    actions: (r.actions || []).map((a) => ({ type: a.type || 'show', fieldKey: a.fieldKey || '' }))
  }));

  return { schemaVersion: FORMS_SCHEMA_VERSION, sections, fields, rules };
}

/** Lowercase-camel key from a label, unique within the scope. */
export function makeFieldKey(label, existingKeys = []) {
  const words = String(label || '').replace(/[^a-zA-Z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('') || 'field';
  if (/^[0-9]/.test(base)) base = 'f' + base;
  const taken = new Set(existingKeys);
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}${n++}`;
  return key;
}

const byOrder = (a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label));

export function sectionsForScope(config, scope, { includeArchived = false } = {}) {
  return (config?.sections || []).filter((s) => s.scope === scope && (includeArchived || !s.archived)).sort(byOrder);
}

export function fieldsForSection(config, sectionId, { includeArchived = false } = {}) {
  return (config?.fields || []).filter((f) => f.sectionId === sectionId && (includeArchived || !f.archived)).sort(byOrder);
}

export function activeOptions(field) {
  return (field?.options || []).filter((o) => !o.archived).sort(byOrder);
}

/** The settings of a built-in field, for components that render it themselves. */
export function systemField(config, scope, key) {
  const f = (config?.fields || []).find((x) => x.system && x.scope === scope && x.key === key);
  const sys = SYSTEM_FIELDS.find((x) => x.scope === scope && x.key === key);
  return f || (sys ? { ...sys, hidden: false, web: true, mobile: true, pdf: true, excel: true } : null);
}

/** Whether a field is on screen for this platform, before rules. */
export function onPlatform(field, platform) {
  if (!field || field.archived) return false;
  return platform === 'mobile' ? field.mobile !== false : field.web !== false;
}

/** Problems that must be fixed before a configuration can be saved or published. */
export function validateFormsConfig(config) {
  const problems = [];
  for (const scope of Object.keys(SCOPES)) {
    const keys = new Map();
    for (const f of config.fields.filter((x) => x.scope === scope)) {
      if (!f.label) problems.push(`A ${SCOPES[scope].label.toLowerCase()} field has no name.`);
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.key)) problems.push(`"${f.label || 'A field'}" has an invalid internal key.`);
      if (keys.has(f.key)) problems.push(`Two ${SCOPES[scope].label.toLowerCase()} fields share the key "${f.key}".`);
      keys.set(f.key, f);
      if (!f.system && !FIELD_TYPES[f.type]?.available && !f.archived) {
        problems.push(`"${f.label}" uses the ${FIELD_TYPES[f.type].label} type, which is not available yet.`);
      }
      if (!f.archived && FIELD_TYPES[f.type]?.hasOptions && !f.system && !activeOptions(f).length) {
        problems.push(`"${f.label}" needs at least one active option.`);
      }
      if (FIELD_TYPES[f.type]?.hasOptions) {
        const values = new Set();
        for (const o of f.options) {
          if (!o.label) problems.push(`"${f.label}" has an option with no text.`);
          if (values.has(o.value.toLowerCase())) problems.push(`"${f.label}" has the option "${o.label}" twice.`);
          values.add(o.value.toLowerCase());
        }
      }
    }
  }
  for (const s of config.sections) {
    if (!s.label) problems.push('A section has no name.');
  }
  for (const r of config.rules.filter((x) => !x.archived)) {
    const name = r.name || 'A rule';
    const scopeKeys = new Set(config.fields.filter((f) => f.scope === r.scope).map((f) => f.key));
    if (!r.conditions.length) problems.push(`${name} has no IF condition.`);
    if (!r.actions.length) problems.push(`${name} has no THEN action.`);
    for (const c of r.conditions) if (!scopeKeys.has(c.fieldKey)) problems.push(`${name} checks a field that does not exist.`);
    for (const a of r.actions) if (!scopeKeys.has(a.fieldKey)) problems.push(`${name} changes a field that does not exist.`);
  }
  return [...new Set(problems)];
}

/**
 * Plain-English differences between two configurations, for the publish
 * preview. The database audit log keeps the full old and new values as well.
 */
export function describeChanges(before, after) {
  const out = [];
  const b = normaliseFormsConfig(before || {});
  const a = normaliseFormsConfig(after || {});
  const scopeName = (s) => SCOPES[s]?.label || s;

  const secB = new Map(b.sections.map((s) => [s.id, s]));
  for (const s of a.sections) {
    const old = secB.get(s.id);
    if (!old) out.push(`Added ${scopeName(s.scope).toLowerCase()} section "${s.label}"`);
    else {
      if (old.label !== s.label) out.push(`Renamed section "${old.label}" to "${s.label}"`);
      if (old.archived !== s.archived) out.push(`${s.archived ? 'Archived' : 'Restored'} section "${s.label}"`);
      if (old.order !== s.order) out.push(`Moved section "${s.label}"`);
    }
  }

  const fB = new Map(b.fields.map((f) => [f.id, f]));
  const flag = (v) => (v ? 'on' : 'off');
  for (const f of a.fields) {
    const old = fB.get(f.id);
    const name = `"${f.label}"`;
    if (!old) {
      out.push(`Added ${scopeName(f.scope).toLowerCase()} field ${name} (${FIELD_TYPES[f.type]?.label}${f.required ? ', required' : ''})`);
      continue;
    }
    if (old.label !== f.label) out.push(`Renamed field "${old.label}" to ${name}`);
    if (old.type !== f.type) out.push(`Changed ${name} from ${FIELD_TYPES[old.type]?.label} to ${FIELD_TYPES[f.type]?.label}`);
    if (old.required !== f.required) out.push(`${name} is now ${f.required ? 'required' : 'optional'}`);
    if (old.archived !== f.archived) out.push(`${f.archived ? 'Archived' : 'Restored'} field ${name}`);
    if (old.hidden !== f.hidden) out.push(`${name} is now ${f.hidden ? 'hidden' : 'shown'}`);
    if (old.sectionId !== f.sectionId) out.push(`Moved ${name} to another section`);
    else if (old.order !== f.order) out.push(`Reordered ${name}`);
    for (const k of ['web', 'mobile', 'pdf', 'excel']) {
      if (old[k] !== f[k]) out.push(`${name}: ${k === 'pdf' ? 'PDF report' : k === 'excel' ? 'Excel report' : k} ${flag(f[k])}`);
    }
    if (old.helpText !== f.helpText) out.push(`Changed the help text of ${name}`);
    const oB = new Map(old.options.map((o) => [o.id, o]));
    for (const o of f.options) {
      const oo = oB.get(o.id);
      if (!oo) out.push(`${name}: added option "${o.label}"`);
      else {
        if (oo.label !== o.label) out.push(`${name}: renamed option "${oo.label}" to "${o.label}"`);
        if (oo.archived !== o.archived) out.push(`${name}: ${o.archived ? 'archived' : 'restored'} option "${o.label}"`);
      }
    }
    if (f.options.some((o) => oB.has(o.id) && oB.get(o.id).order !== o.order)) out.push(`${name}: reordered options`);
  }

  const rB = new Map(b.rules.map((r) => [r.id, r]));
  for (const r of a.rules) {
    const old = rB.get(r.id);
    const name = `rule "${r.name || 'Untitled'}"`;
    if (!old) out.push(`Added ${name}`);
    else if (JSON.stringify(old) !== JSON.stringify(r)) {
      if (old.archived !== r.archived) out.push(`${r.archived ? 'Archived' : 'Restored'} ${name}`);
      else if (old.enabled !== r.enabled) out.push(`${r.enabled ? 'Enabled' : 'Disabled'} ${name}`);
      else out.push(`Changed ${name}`);
    }
  }
  return out;
}

/** The values a rule or required-check reads for one facility or snag. */
export function valuesForScope(scope, record = {}) {
  if (scope === 'facility') {
    const f = record || {};
    return {
      ...(f.custom || {}),
      facilityName: f.facilityName, facilityType: f.facilityType, grossInternalArea: f.grossInternalArea,
      address: f.googleLocation?.address ?? f.address,
      latitude: f.googleLocation?.latitude, longitude: f.googleLocation?.longitude,
      scopeNotes: f.scopeNotes
    };
  }
  const i = record || {};
  return {
    ...(i.customValues || {}),
    location: i.location, department: i.department, priority: i.priority,
    defectDescription: i.defectDescription, estimatedCost: i.estimatedCost, quantity: i.quantity,
    photos: i.photos || []
  };
}

export { isEmptyValue };
