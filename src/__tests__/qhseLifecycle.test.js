import { test, expect } from 'vitest';
import { createQhse, createPhotoEvidence } from '../qhse/model';
import { changeInspectionState, isDeletedInspection } from '../qhse/lifecycle';
import { stageOf } from '../utils/workflow';
import { projectTrashNotes, readProjectTrash } from '../utils/projectTrash';

test('submission validates a real report and keeps the existing report rather than creating a blank draft', () => {
  const record = createQhse('p', 1, { name: 'Site', location: 'Address' });
  expect(() => changeInspectionState(record, 'submit')).toThrow('Add a finding');
  record.items = [createPhotoEvidence([{ id: 'photo', caption: 'Remark', dataUrl: 'evidence' }])];
  const submitted = changeInspectionState(record, 'submit', '2026-10-08T16:00:00Z');
  expect(submitted.id).toBe(record.id); expect(submitted.items).toEqual(record.items);
  expect(submitted.submittedAt).toBe('2026-10-08T16:00:00Z'); expect(stageOf(submitted)).toBe('submitted');
  expect(stageOf({ ...submitted, facility: { ...submitted.facility, qhse: { ...submitted.facility.qhse, reportNumber: '' } } })).toBe('submitted');
});
test('delete and restore preserve photos, fields, IDs and the last submitted status and timestamp', () => {
  const record = createQhse('p', 1, { name: 'Site', location: 'Address' });
  record.items = [createPhotoEvidence([{ id: 'p1', caption: 'Existing remark', dataUrl: 'evidence' }])];
  const submitted = changeInspectionState(record, 'submit', '2026-10-08T16:00:00Z');
  const deleted = changeInspectionState(submitted, 'delete');
  expect(isDeletedInspection(deleted)).toBe(true); expect(deleted.items).toEqual(submitted.items);
  expect(() => changeInspectionState(deleted, 'submit')).toThrow('Restore');
  expect(changeInspectionState(deleted, 'restore')).toEqual(submitted);
});
test('approved inspections cannot be submitted, deleted or restored without reopening', () => {
  const record = { ...createQhse('p'), status: 'submitted', reviewStatus: 'approved' };
  for (const action of ['submit','delete','restore']) expect(() => changeInspectionState(record, action)).toThrow('Reopen');
});
test('project deletion preserves arbitrary notes exactly and restores without a schema change', () => {
  for (const notes of ['Important notes\nSecond line', '{"ordinary":"notes"}', '', '📷 Inspection project']) {
    const deleted = projectTrashNotes(notes, true, '2026-10-08T16:00:00Z');
    expect(readProjectTrash(deleted).notes).toBe(notes);
    expect(projectTrashNotes(deleted, true)).toBe(deleted);
    expect(projectTrashNotes(deleted, false)).toBe(notes);
  }
  expect(readProjectTrash('{"_fmProjectTrash":1}')).toBeNull();
});
