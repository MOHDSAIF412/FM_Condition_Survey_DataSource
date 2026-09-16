/**
 * Custom fields in the PDF and Excel reports.
 *
 * Reports read the published configuration this device last loaded (the same
 * copy the screens use), so a report generated offline still includes the
 * fields that were live when the device was last online.
 *
 * Archived fields still appear when a record holds a value for them: a report
 * about past work must show what was recorded, even if the field is no longer
 * offered for new work.
 */
import { cachedPublishedConfig } from './configStore';
import { sectionsForScope, fieldsForSection } from './formConfig';
import { formatValue, isEmptyValue } from './fieldTypes';

export function reportFieldsFor(scope, kind, records = [], config = cachedPublishedConfig('forms').config) {
  const valuesOf = (r) => (scope === 'facility' ? r?.custom : r?.customValues) || {};
  const hasValue = (field) => records.some((r) => !isEmptyValue(field.type, valuesOf(r)[field.key]));
  return sectionsForScope(config, scope, { includeArchived: true })
    .flatMap((s) => fieldsForSection(config, s.id, { includeArchived: true }))
    .filter((f) => !f.system && f[kind] !== false)
    .filter((f) => (!f.archived && !config.sections.find((s) => s.id === f.sectionId)?.archived) || hasValue(f));
}

export function reportValue(field, record, scope) {
  const values = (scope === 'facility' ? record?.custom : record?.customValues) || {};
  return formatValue(field, values[field.key]);
}
