import { describe, test, expect, vi } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: {}, isCloudConfigured: false }));

const { stageOf, isOverdue, withDueDates, workflowActions, todayISO, isLockedRefusal } = await import('../utils/workflow');

describe('stageOf', () => {
  test.each([
    [{ status: 'draft' }, 'draft'],
    [{ status: 'draft', reviewStatus: 'changes_requested' }, 'changes_requested'],
    [{ status: 'submitted' }, 'submitted'],
    [{ status: 'submitted', reviewStatus: 'in_review' }, 'in_review'],
    [{ status: 'submitted', reviewStatus: 'approved' }, 'approved'],
    // A pulled facility carries it under `review`.
    [{ status: 'submitted', review: { status: 'approved' } }, 'approved'],
    // Resubmitted before the list caught up: the submission wins.
    [{ status: 'submitted', reviewStatus: 'changes_requested' }, 'submitted']
  ])('%j -> %s', (row, stage) => expect(stageOf(row)).toBe(stage));
});

describe('due dates', () => {
  const projects = [{ id: 'p1', dueDate: '2026-09-30' }];
  test('a facility date wins over its project date', () => {
    const [a, b] = withDueDates([{ id: 'a', projectId: 'p1' }, { id: 'b', projectId: 'p1', dueDate: '2026-09-05' }], projects);
    expect(a.effectiveDue).toBe('2026-09-30');
    expect(b.effectiveDue).toBe('2026-09-05');
  });
  test('overdue only before today and only until approved', () => {
    expect(isOverdue({ status: 'draft', effectiveDue: '2026-09-17' }, '2026-09-18')).toBe(true);
    expect(isOverdue({ status: 'draft', effectiveDue: '2026-09-18' }, '2026-09-18')).toBe(false);
    expect(isOverdue({ status: 'submitted', reviewStatus: 'approved', effectiveDue: '2026-01-01' }, '2026-09-18')).toBe(false);
    expect(isOverdue({ status: 'draft' }, '2026-09-18')).toBe(false);
  });
  test('today is a local calendar day', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('workflowActions', () => {
  const surveyor = { role: 'surveyor' };
  const engineer = { role: 'engineer' };
  const manager = { role: 'manager' };
  test('by role and stage', () => {
    expect(workflowActions(surveyor, { status: 'submitted' })).toEqual([]);
    expect(workflowActions(engineer, { status: 'submitted' })).toEqual(['start_review', 'request_changes']);
    expect(workflowActions(manager, { status: 'submitted', reviewStatus: 'in_review' })).toEqual(['approve', 'request_changes']);
    expect(workflowActions(manager, { status: 'submitted', reviewStatus: 'approved' })).toEqual(['reopen']);
    expect(workflowActions(engineer, { status: 'submitted', reviewStatus: 'approved' })).toEqual([]);
    expect(workflowActions(manager, { status: 'draft' })).toEqual([]);
  });
});

test('recognises the database refusing a change to an approved facility', () => {
  expect(isLockedRefusal({ message: 'Refused: this facility is approved and locked. A Manager or Admin can reopen it.' })).toBe(true);
  expect(isLockedRefusal({ message: 'Failed to fetch' })).toBe(false);
});
