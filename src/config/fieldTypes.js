/**
 * Field types the form builder offers.
 *
 * `available: false` types are listed so the builder is honest about what is
 * coming, but cannot be chosen yet: photo, file, signature and location fields
 * need uploads and an offline queue of their own, and a field that accepts a
 * value the app cannot store would lose the surveyor's work.
 */
export const FIELD_TYPES = {
  text:        { id: 'text',        label: 'Text',              group: 'text',    available: true },
  textarea:    { id: 'textarea',    label: 'Long text',         group: 'text',    available: true },
  number:      { id: 'number',      label: 'Number',            group: 'number',  available: true },
  date:        { id: 'date',        label: 'Date',              group: 'date',    available: true },
  dropdown:    { id: 'dropdown',    label: 'Dropdown',          group: 'choice',  available: true, hasOptions: true },
  multiselect: { id: 'multiselect', label: 'Multi-select',      group: 'choices', available: true, hasOptions: true },
  checkbox:    { id: 'checkbox',    label: 'Checkbox',          group: 'bool',    available: true },
  yesno:       { id: 'yesno',       label: 'Yes / No',          group: 'bool',    available: true },
  rating:      { id: 'rating',      label: 'Rating (1–5)',      group: 'number',  available: true },
  photo:       { id: 'photo',       label: 'Photo',             group: 'media',   available: false },
  file:        { id: 'file',        label: 'File / PDF',        group: 'media',   available: false },
  signature:   { id: 'signature',   label: 'Signature',         group: 'media',   available: false },
  location:    { id: 'location',    label: 'Location (GPS)',    group: 'geo',     available: false }
};

/**
 * Type changes allowed once a field has been published, because values already
 * recorded still mean the same thing afterwards. Anything else: archive the
 * field and create a new one, so historical answers are never reinterpreted.
 */
const SAFE_CHANGES = {
  text: ['textarea'],
  textarea: ['text'],
  dropdown: ['multiselect'],
  checkbox: ['yesno'],
  yesno: ['checkbox'],
  rating: ['number']
};

export function canChangeType(from, to, { published = false } = {}) {
  if (from === to) return true;
  if (!FIELD_TYPES[to]?.available) return false;
  if (!published) return true;
  return (SAFE_CHANGES[from] || []).includes(to);
}

/** Whether a value counts as answered, per type. */
export function isEmptyValue(type, value) {
  if (value === null || value === undefined) return true;
  if (type === 'multiselect') return !Array.isArray(value) || value.length === 0;
  if (type === 'checkbox') return value !== true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/** A readable form of a stored value, for reports and the audit log. */
export function formatValue(field, value) {
  if (isEmptyValue(field?.type, value) && field?.type !== 'checkbox') return '';
  const labelOf = (v) => (field.options || []).find((o) => o.value === v)?.label ?? String(v);
  switch (field?.type) {
    case 'dropdown': return labelOf(value);
    case 'multiselect': return (Array.isArray(value) ? value : [value]).map(labelOf).join(', ');
    case 'checkbox': return value === true ? 'Yes' : 'No';
    case 'yesno': return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : String(value);
    case 'rating': return `${value} / 5`;
    default: return String(value);
  }
}
