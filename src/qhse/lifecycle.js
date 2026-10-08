import { isQhse, inspectionIssues } from './model';
import { isLocked } from '../utils/workflow';

export const isDeletedInspection = s => isQhse(s) && !!s.facility?.qhse?.deletedAt;

export function changeInspectionState(record, action, now = new Date().toISOString()) {
  if (!isQhse(record)) throw new Error('Select a QHSE inspection.');
  if (isLocked(record)) throw new Error('Reopen the approved inspection before changing it.');
  if (action === 'submit') {
    if (isDeletedInspection(record)) throw new Error('Restore this inspection before submitting it.');
    const issues = inspectionIssues(record);
    if (!(record.items || []).some(i => i.photos?.length || (!i.customValues?.qhseEvidenceOnly && i.defectDescription?.trim())) && !record.facility.qhse.summary?.trim())
      issues.push('Add a finding, photo or inspection summary before submitting.');
    if (issues.length) throw new Error(issues.join(' '));
    return { ...record, status: 'submitted', submittedAt: now };
  }
  if (!['delete', 'restore'].includes(action)) throw new Error('Unknown inspection action.');
  const qhse = { ...record.facility.qhse };
  if (action === 'delete') qhse.deletedAt = now;
  else delete qhse.deletedAt;
  return { ...record, facility: { ...record.facility, qhse } };
}
