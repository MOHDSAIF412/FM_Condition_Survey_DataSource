import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const updater = vi.hoisted(() => ({ addListener: vi.fn(), current: vi.fn(), getLatest: vi.fn(), getNextBundle: vi.fn(), download: vi.fn(), next: vi.fn(), set: vi.fn(), notifyAppReady: vi.fn() }));
const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, CapacitorHttp: http }));
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
  http.get.mockRejectedValue(new Error('Connection timed out'));
});

test('native check failure falls back to the verified release and reports already current', async () => {
  updater.getLatest.mockRejectedValue(new Error('native check failed'));
  http.get.mockResolvedValue({ status: 200, data: { version: '1.0.123', path: '/ota/bundle-1.0.123.zip', sha256: 'a'.repeat(64) } });
  const ota = await import('../utils/otaUpdates');
  await ota.initOtaUpdates(); await ota.checkOtaUpdate();
  expect(ota.otaStatus().phase).toBe('current');
  expect(http.get).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringMatching(/^https:\/\/fm-condition-survey-data-source.vercel.app\/ota\/manifest.json\?check=/) }));
  updater.addListener.mock.calls.find(([event]) => event === 'downloadFailed')[1]({ version: '1.0.123' });
  updater.addListener.mock.calls.find(([event]) => event === 'download')[1]({ percent: 80, bundle: { version: '1.0.123' } });
  expect(ota.otaStatus().phase).toBe('current');
  expect(updater.download).not.toHaveBeenCalled();
});

test('fallback stages a new release with its checksum', async () => {
  const ota = await import('../utils/otaUpdates');
  await ota.initOtaUpdates(); await ota.checkOtaUpdate();
  updater.getLatest.mockRejectedValue(new Error('native check failed'));
  http.get.mockResolvedValue({ status: 200, data: { version: '1.0.124', path: '/ota/bundle-1.0.124.zip', sha256: 'a'.repeat(64) } });
  updater.download.mockResolvedValue({ id: 'new', version: '1.0.124', status: 'pending' });
  await ota.checkOtaUpdate();
  expect(updater.download).toHaveBeenCalledWith({ url: 'https://fm-condition-survey-data-source.vercel.app/ota/bundle-1.0.124.zip', version: '1.0.124', checksum: 'a'.repeat(64) });
  expect(ota.otaStatus().phase).toBe('ready');
});

test.each([
  { version: '1.0.124', path: '//attacker.example/evil.zip', sha256: 'a'.repeat(64) },
  { version: '1.0.124', path: '/ota/bundle-1.0.124.zip', sha256: '' },
  { version: '1.0.124', path: '/ota/bundle-1.0.123.zip', sha256: 'a'.repeat(64) }
])('fallback rejects invalid release metadata', async data => {
  updater.getLatest.mockRejectedValue(new Error('native check failed'));
  http.get.mockResolvedValue({ status: 200, data });
  const ota = await import('../utils/otaUpdates');
  await ota.initOtaUpdates(); await ota.checkOtaUpdate();
  expect(ota.otaStatus().phase).toBe('error');
  expect(updater.download).not.toHaveBeenCalled();
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

test('startup ignores an already installed next bundle and delayed native events do not reload', async () => {
  const installed = { id: 'installed', version: '1.0.123', status: 'success' };
  updater.current.mockResolvedValue({ bundle: installed });
  updater.getNextBundle.mockResolvedValue(installed);
  const ota = await import('../utils/otaUpdates');
  ota.allowOtaAtSafeScreen(() => true);
  await ota.initOtaUpdates(); await ota.checkOtaUpdate();
  expect(ota.otaStatus().phase).toBe('current');
  const available = updater.addListener.mock.calls.find(([event]) => event === 'updateAvailable')[1];
  available({ bundle: installed });
  await vi.advanceTimersByTimeAsync(10000);
  expect(updater.set).not.toHaveBeenCalled();
  expect(updater.download).not.toHaveBeenCalled();
  expect(ota.otaStatus()).toMatchObject({ phase: 'current', message: 'Your app is up to date.' });
});
