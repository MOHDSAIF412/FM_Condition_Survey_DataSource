import { normaliseFormsConfig, defaultFormsConfig } from '../config/formConfig';
import { INSPECTION_FIELDS, FINDING_FIELDS } from '../qhse/model';
import { HEADER_FIELDS, METER_FIELDS } from '../meter/model';

export const TEMPLATE_MODULES = { condition: 'Condition Survey', qhse: 'QHSE Inspection', meter: 'Meter Mapping' };
const clone = value => structuredClone(value);
export const templateModule = template => template?.module || 'condition';
export const templatesForModule = (templates, module) => templates.filter(t => !t.archived && templateModule(t) === module);

export function standardProjectTemplate(module, formsConfig = defaultFormsConfig()) {
  return { id: `standard-${module}`, name: `${TEMPLATE_MODULES[module]} standard`, module, standard: true, items: [],
    fieldLayout: module === 'condition' ? { formsConfig: clone(formsConfig) } : { hidden: [], custom: [] } };
}

// Templates describe fields/checklists only. Never copy report values, photos or signatures.
export function projectTemplateCopy(template, module, formsConfig) {
  if (templateModule(template) !== module) throw new Error('Select a template from this module.');
  const base = standardProjectTemplate(module, formsConfig);
  const result = { ...base, ...clone(template), module, items: clone(template.items || []),
    fieldLayout: clone(template.fieldLayout || base.fieldLayout) };
  if (module === 'condition') result.fieldLayout.formsConfig = normaliseFormsConfig(result.fieldLayout.formsConfig || formsConfig || defaultFormsConfig());
  else {
    const locked = templateFields(base).filter(f => f.locked).map(f => f.key);
    result.fieldLayout.hidden = (result.fieldLayout.hidden || []).filter(key => !locked.includes(key));
  }
  return result;
}

export function templateFields(template) {
  if (template.module === 'condition') return (template.fieldLayout.formsConfig.fields || []).filter(f => !f.archived).map(f => ({
    key: f.id, label: f.label, group: f.scope === 'facility' ? 'Facility fields' : 'Snag fields',
    visible: !f.hidden && f.web !== false && f.mobile !== false, locked: !!f.lockVisible || !!f.required }));
  const sets = template.module === 'qhse'
    ? [['inspection', 'Inspection details', INSPECTION_FIELDS], ['finding', 'Finding fields', FINDING_FIELDS]]
    : [['header', 'Mapping details', HEADER_FIELDS], ['meter', 'Meter fields', METER_FIELDS]];
  return sets.flatMap(([scope, group, fields]) => [...fields, ...(template.fieldLayout.custom || []).filter(f => f.scope === scope)].map(f => ({ key: `${scope}:${f.id}`, label: f.label, group,
    visible: !(template.fieldLayout.hidden || []).includes(`${scope}:${f.id}`),
    locked: !!f.required || !!f.calculated || (template.module === 'meter' && ['powerLoad','operatingHours','diversityFactor','tariff'].includes(f.id)) })));
}

export function addTemplateField(template, { label, scope, type = 'text' }) {
  if (!label?.trim()) throw new Error('Enter a field name.');
  const next = clone(template), id = `custom_${crypto.randomUUID()}`;
  next.standard = false;
  if (next.module === 'condition') {
    const config = next.fieldLayout.formsConfig;
    next.fieldLayout.formsConfig = normaliseFormsConfig({ ...config, fields: [...config.fields,
      { id, key: id, scope, label: label.trim(), type, sectionId: scope === 'facility' ? 'facility_scope' : 'snag_details' }] });
  } else next.fieldLayout.custom = [...(next.fieldLayout.custom || []), { id, label: label.trim(), scope, type, custom: true }];
  return next;
}

export function toggleTemplateField(template, key, visible) {
  const field = templateFields(template).find(f => f.key === key);
  if (!field || field.locked) return template;
  const next = clone(template);
  next.standard = false;
  if (next.module === 'condition') next.fieldLayout.formsConfig.fields = next.fieldLayout.formsConfig.fields.map(f => f.id === key ? { ...f, hidden: !visible, web: visible, mobile: visible, ...(!f.system ? { pdf: visible, excel: visible } : {}) } : f);
  else next.fieldLayout.hidden = visible ? (next.fieldLayout.hidden || []).filter(k => k !== key) : [...new Set([...(next.fieldLayout.hidden || []), key])];
  return next;
}

export function recordFormsConfig(record, fallback) {
  return record?.facility?.projectTemplate?.module === 'condition' ? record.facility.projectTemplate.fieldLayout?.formsConfig || fallback : fallback;
}

export function attachProjectTemplate(record, project) {
  if (!project?.reportTemplate) return record;
  const module = record.facility?.module || 'condition';
  if (templateModule(project.reportTemplate) !== module) return record;
  return { ...record, facility: { ...record.facility, projectTemplate: projectTemplateCopy(project.reportTemplate, module) } };
}
