import { describe, test, expect, vi } from 'vitest';
import { reportCompleteness, confirmReportReady } from '../utils/reportCompleteness';

const photo = (withBytes = true) => ({ id: Math.random().toString(36), dataUrl: withBytes ? 'data:image/jpeg;base64,x' : null, storagePath: 'a/b.jpg' });
const snag = (o = {}) => ({ id: Math.random().toString(36), priority: 2, defectDescription: 'Cracked tile', photos: [photo()], ...o });
const facility = (items, o = {}) => ({ id: 'f', status: 'submitted', items, ...o });

describe('reportCompleteness', () => {
  test('a complete facility has no issues', () => {
    expect(reportCompleteness(facility([snag(), snag()]))).toMatchObject({ ok: true, issues: [] });
  });

  test('separates urgent snags with no photo from the rest', () => {
    const r = reportCompleteness(facility([snag({ priority: 1, photos: [] }), snag({ photos: [] }), snag()]));
    expect(r.counts).toMatchObject({ urgentNoPhoto: 1, otherNoPhoto: 1 });
    expect(r.issues[0]).toBe('1 urgent (P1) snag has no photo');
    expect(r.issues[1]).toBe('1 other snag has no photo');
  });

  test('flags photos whose files could not be downloaded', () => {
    const r = reportCompleteness(facility([snag({ photos: [photo(), photo(false), photo(false)] })]));
    expect(r.counts.missingPhotoFiles).toBe(2);
    expect(r.issues).toContain('2 photos could not be loaded and will be missing');
  });

  test('flags missing descriptions, empty facilities and drafts', () => {
    const r = reportCompleteness([
      facility([snag({ defectDescription: '   ' })], { status: 'draft' }),
      facility([])
    ]);
    expect(r.issues).toEqual(expect.arrayContaining([
      '1 snag has no defect description',
      '1 facility has no snags',
      '1 facility is still a draft, not submitted'
    ]));
  });

  test('does not warn about missing cost, which no snag in the live data has', () => {
    expect(reportCompleteness(facility([snag({ estimatedCost: 0 })])).ok).toBe(true);
  });

  test('accepts a single facility or a list, and ignores nulls', () => {
    expect(reportCompleteness([facility([snag()]), null]).counts.facilities).toBe(1);
  });
});

describe('confirmReportReady', () => {
  test('does not ask when nothing is missing', () => {
    const ask = vi.fn();
    expect(confirmReportReady(facility([snag()]), ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  test('asks with the list of gaps and respects the answer', () => {
    const ask = vi.fn().mockReturnValue(false);
    expect(confirmReportReady(facility([snag({ priority: 1, photos: [] })]), ask)).toBe(false);
    expect(ask.mock.calls[0][0]).toContain('• 1 urgent (P1) snag has no photo');
  });
});
