import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createOtaController } from '../utils/otaController';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const bundle = { id: 'downloaded', version: '1.0.123', status: 'pending' };

test('applies downloaded update automatically without asking for an APK', async () => {
  const updater = { set: vi.fn().mockResolvedValue() };
  const publish = vi.fn();
  const controller = createOtaController(updater, () => true, publish);
  controller.available(bundle);
  await vi.advanceTimersByTimeAsync(2000);
  expect(updater.set).toHaveBeenCalledWith({ id: bundle.id });
  expect(publish).toHaveBeenLastCalledWith(expect.stringContaining('reopen automatically'));
  controller.available(bundle);
  await vi.advanceTimersByTimeAsync(4000);
  expect(updater.set).toHaveBeenCalledOnce();
  controller.stop();
});

test('never reloads during editing or pending saves; resumes when safe', async () => {
  let safe = false;
  const updater = { set: vi.fn().mockResolvedValue() };
  const controller = createOtaController(updater, () => safe, vi.fn());
  controller.available(bundle);
  await vi.advanceTimersByTimeAsync(10000);
  expect(updater.set).not.toHaveBeenCalled();
  safe = true;
  await vi.advanceTimersByTimeAsync(2000);
  expect(updater.set).toHaveBeenCalledOnce();
  controller.stop();
});

test('rechecks safety when the user leaves the chooser before installation', async () => {
  let safe = true;
  const updater = { set: vi.fn() };
  const controller = createOtaController(updater, () => safe, vi.fn());
  controller.available(bundle);
  safe = false;
  await vi.advanceTimersByTimeAsync(2000);
  expect(updater.set).not.toHaveBeenCalled();
  controller.stop();
});

test('ignores incomplete/failed bundles and stops retry loops after apply failure', async () => {
  const updater = { set: vi.fn().mockRejectedValue(new Error('bad bundle')) };
  const publish = vi.fn();
  const controller = createOtaController(updater, () => true, publish);
  for (const status of ['error', 'downloading', 'deleted']) controller.available({ ...bundle, status });
  await vi.advanceTimersByTimeAsync(2000);
  expect(updater.set).not.toHaveBeenCalled();
  controller.available(bundle);
  await vi.advanceTimersByTimeAsync(2000);
  expect(publish).toHaveBeenLastCalledWith(expect.stringContaining('could not be applied'));
  controller.available(bundle);
  await vi.advanceTimersByTimeAsync(10000);
  expect(updater.set).toHaveBeenCalledOnce();
  updater.set.mockResolvedValue();
  controller.available(bundle, { retry: true });
  await vi.advanceTimersByTimeAsync(2000);
  expect(updater.set).toHaveBeenCalledTimes(2);
  controller.stop();
});
