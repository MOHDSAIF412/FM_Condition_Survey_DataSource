import React, { createContext, useContext } from 'react';
import { useFormsConfig } from '../config/FormsConfigContext';
import { missingRequiredFields } from '../config/rulesEngine';

export const SubmissionValidation = createContext(false);

export function useFieldError(scope, record, key) {
  const attempted = useContext(SubmissionValidation);
  const { config, platform } = useFormsConfig();
  if (!attempted) return '';
  if (scope === 'facility' && key === 'facilityName' && !String(record?.facilityName || '').trim()) return 'Enter the facility name.';
  const field = missingRequiredFields(config, scope, record, platform).find((f) => f.key === key);
  return field ? `${field.label} is required.` : '';
}

export function FieldError({ scope, record, fieldKey, id }) {
  const error = useFieldError(scope, record, fieldKey);
  return error ? <p id={id} className="text-xs text-rose-700 mt-1" role="alert">{error}</p> : null;
}

export function focusSubmissionField(issue) {
  window.dispatchEvent(new CustomEvent('fm:focus-field', { detail: issue }));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const facilityIds = { facilityName:'facility-name', facilityType:'facility-type', grossInternalArea:'facility-gia', address:'facility-address' };
    const snagIds = { location:'location', defectDescription:'defect', estimatedCost:'cost', quantity:'qty' };
    const id = issue.scope === 'facility' ? (facilityIds[issue.key] || `facility-${issue.key}`)
      : snagIds[issue.key] ? `snag-${snagIds[issue.key]}-${issue.itemId}` : `snag-${issue.itemId}-${issue.key}`;
    const element = document.getElementById(id) || document.getElementById(`snag-${issue.itemId}-card`);
    element?.scrollIntoView({ block:'center', behavior:'smooth' });
    if (element?.matches('input,select,textarea,button')) element.focus({ preventScroll:true });
    else (element?.querySelector('input,select,textarea,button') || element)?.focus({ preventScroll:true });
  }));
}
