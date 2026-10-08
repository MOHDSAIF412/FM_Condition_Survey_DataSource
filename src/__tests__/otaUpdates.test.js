import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const updater = vi.hoisted(() => ({ addListener: vi.fn(), current: vi.fn(), getLatest: vi.fn(), getNextBundle: vi.fn(), download: vi.fn(), next: vi.fn(), set: vi.fn(), notifyAppReady: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: updater }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn() });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  vi.stubGlobal('navigator', { onLine: true });
  updater.current.mockResolvedValue({ bundle: { version: '1.0.123' } });
  updater.getLatest.mockResolvedValue({ version: '1.0.123' });
  updater.getNextBundle.mockResolvedValue(null);
  updater.addListener.mockResolvedValue({ remove: vi.fn() });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

test('a successful check clears a stale download failure and reports current version', async () => {
  const ota = await import('../utils/otaUpdates');
  await ota.initOtaUpdates(); await ota.checkOtaUpdate();
  const failed = updater.addListener.mock.calls.find(([event]) => event === 'downloadFailed')[1];
  failed(); expect(ota.otaStatus().phase).toBe('error');
  updater.addListener.mock.calls.find(([event]) => event === 'noNeedUpdate')[1]();
  expect(ota.otaStatus().phase).toBe('error');
  await ota.checkOtaUpdate();
  expect(ota.otaStatus()).toMatchObject({ phase: 'current', version: '1.0.123', message: 'Your app is up to date.' });
  expect(updater.download).not.toHaveBeenCalled();
});

test('Get update downloads and stages a new bundle; repeat clicks share one request', async () => {
  const ota = await import('../utils/otaUpdates');
  await ota.initOtaUpdates(); await ota.checkOtaUpdate();
  updater.getLatest.mockResolvedValue({ version: '1.0.124', url: 'https://fm-condition-survey-data-source.vercel.app/ota/bundle-1.0.124.zip' });
  updater.download.mockResolvedValue({ id: 'new', version: '1.0.124', status: 'pending' });
  const first = ota.checkOtaUpdate();
  expect(ota.checkOtaUpdate()).toBe(first);
  await first;
  expect(updater.download).toHaveBeenCalledOnce();
  expect(updater.next).toHaveBeenCalledWith({ id: 'new' });
  expect(ota.otaStatus().phase).toBe('ready');
  expect(updater.set).not.toHaveBeenCalled();
});

test('a failed check gives a retryable error and the next check can recover', async () => {
  const ota = await import('../utils/otaUpdates');
  await ota.initOtaUpdates(); await ota.checkOtaUpdate();
  updater.getLatest.mockRejectedValueOnce(new Error('Connection timed out'));
  await ota.checkOtaUpdate();
  expect(ota.otaStatus().message).toContain('Connection timed out');
  expect(ota.otaStatus().phase).toBe('error');
  await ota.checkOtaUpdate(); expect(ota.otaStatus().phase).toBe('current');
});
