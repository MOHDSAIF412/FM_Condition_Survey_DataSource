import { test, expect, vi } from 'vitest';

// cloudSync imports the Supabase client, which reads env at import time.
vi.mock('../utils/supabaseClient', () => ({ supabase: {}, isCloudConfigured: false, PHOTO_BUCKET: 'x' }));

const { withTimeout, mapWithConcurrency } = await import('../utils/cloudSync');

test('resolves with the value when the work finishes in time', async () => {
  await expect(withTimeout(Promise.resolve('done'), 1000)).resolves.toBe('done');
});

test('passes through the original rejection when it fails in time', async () => {
  await expect(withTimeout(Promise.reject(new Error('Failed to fetch')), 1000)).rejects.toThrow('Failed to fetch');
});

test('rejects with a timeout error when the work is too slow', async () => {
  vi.useFakeTimers();
  const never = new Promise(() => {});
  const p = withTimeout(never, 6000, 'Opening facility');
  vi.advanceTimersByTime(6000);
  await expect(p).rejects.toMatchObject({ timeout: true, message: 'Opening facility timed out after 6s' });
  vi.useRealTimers();
});

test('mapWithConcurrency keeps order and never exceeds the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 10;
  });
  expect(out).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  expect(peak).toBeLessThanOrEqual(3);
});
