import { test, expect, vi } from 'vitest';
import { uploadSurveyRecord } from '../utils/uploadRecord';

const record = { id: 'f1', cloudRevision: 4, status: 'submitted' };

test('marks synced when the server accepts the upload', async () => {
  const push = vi.fn().mockResolvedValue({ pushed: true });
  const markSynced = vi.fn();
  const res = await uploadSurveyRecord(record, { push, markSynced });
  expect(res.pushed).toBe(true);
  expect(markSynced).toHaveBeenCalledWith('f1', record, { pushed: true });
});

test('does NOT mark synced when the server refuses the upload', async () => {
  // Regression: submitting pushed, ignored the result and marked the facility
  // synced, so a refused submission was never retried and never arrived.
  const push = vi.fn().mockResolvedValue({ conflict: true, reason: 'destructive', serverItems: 12, localItems: 2 });
  const markSynced = vi.fn();
  const res = await uploadSurveyRecord(record, { push, markSynced });
  expect(res.pushed).toBeUndefined();
  expect(markSynced).not.toHaveBeenCalled();
});

test('keeps a stale device copy pending instead of rebasing over server changes', async () => {
  const push = vi.fn()
    .mockResolvedValueOnce({ conflict: true, reason: 'stale', serverRevision: 7, seenRevision: 4 })
    .mockResolvedValueOnce({ pushed: true });
  const markSynced = vi.fn();
  await uploadSurveyRecord(record, { push, markSynced });
  expect(push).toHaveBeenCalledTimes(1);
  expect(markSynced).not.toHaveBeenCalled();
});

test('leaves the facility unsent when the network fails', async () => {
  const push = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
  const markSynced = vi.fn();
  await expect(uploadSurveyRecord(record, { push, markSynced })).rejects.toThrow('Failed to fetch');
  expect(markSynced).not.toHaveBeenCalled();
});

test('does not mark synced if the re-based upload is also refused', async () => {
  const push = vi.fn()
    .mockResolvedValueOnce({ conflict: true, reason: 'stale', serverRevision: 7 })
    .mockResolvedValueOnce({ conflict: true, reason: 'destructive' });
  const markSynced = vi.fn();
  await uploadSurveyRecord(record, { push, markSynced });
  expect(markSynced).not.toHaveBeenCalled();
});
