import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { createOtaController } from './otaController';

let started = false, updater, controller, checking = null;
let applyGuard = () => false;
let state = { phase: 'idle', message: 'Updates download automatically while online.', version: null, checkedAt: null, percent: null };
const listeners = new Set();
export const otaStatus = () => state;
export function subscribeOta(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function publish(changes) { state = { ...state, ...changes }; listeners.forEach(fn => fn()); }
const UPDATE_ORIGIN = 'https://fm-condition-survey-data-source.vercel.app';
async function latestUpdate() {
  try { return await updater.getLatest(); }
  catch (nativeError) {
    // A failed native POST must not prevent checking the self-hosted release.
    // CapacitorHttp is built into the installed shell and avoids WebView CORS.
    const response = await CapacitorHttp.get({
      url: `${UPDATE_ORIGIN}/ota/manifest.json?check=${Date.now()}`,
      headers: { 'Cache-Control': 'no-cache' }, responseType: 'json',
      connectTimeout: 15000, readTimeout: 15000
    });
    const manifest = response.data;
    if (response.status !== 200 || !/^\d+\.\d+\.\d+$/.test(manifest?.version || '')
        || manifest.path !== `/ota/bundle-${manifest.version}.zip`
        || !/^[a-f0-9]{64}$/i.test(manifest.sha256 || '')) {
      throw new Error(`The published update could not be verified (${response.status}).`);
    }
    return { version: manifest.version, url: `${UPDATE_ORIGIN}${manifest.path}`, checksum: manifest.sha256 };
  }
}
export function allowOtaAtSafeScreen(guard) {
  applyGuard = guard;
  return () => { if (applyGuard === guard) applyGuard = () => false; };
}

export function checkOtaUpdate() {
  if (checking) return checking;
  if (!updater) return Promise.resolve();
  checking = runCheck().finally(() => { checking = null; });
  return checking;
}
async function runCheck() {
  if (navigator.onLine === false) {
    publish({ phase: 'error', message: 'You are offline. Connect to the internet, then tap Get update.' });
    return;
  }
  publish({ phase: 'checking', message: 'Checking for updates…', percent: null });
  try {
    const current = await updater.current();
    publish({ version: current.bundle.version });
    const latest = await latestUpdate();
    if (!latest.version) throw new Error('The update server did not return a version.');
    publish({ checkedAt: Date.now() });
    if (latest.version === current.bundle.version) {
      publish({ phase: 'current', message: 'Your app is up to date.' });
      return;
    }
    // Only accept this app's HTTPS update bundles.
    const url = new URL(latest.url);
    if (url.origin !== 'https://fm-condition-survey-data-source.vercel.app'
        || !/^\/ota\/bundle-\d+\.\d+\.\d+\.zip$/.test(url.pathname)) throw new Error('Invalid update download address.');
    publish({ phase: 'downloading', message: 'Downloading update…', percent: 0 });
    let bundle = await updater.getNextBundle().catch(() => null);
    if (bundle?.version !== latest.version || !['pending', 'success'].includes(bundle.status)) {
      bundle = await updater.download({ url: latest.url, version: latest.version, ...(latest.checksum ? { checksum: latest.checksum } : {}) });
    }
    await updater.next({ id: bundle.id });
    controller.available(bundle, { retry: true });
  } catch (error) {
    publish({ phase: 'error', message: `Could not get the update. ${error?.message || 'Please check your connection.'} Tap Get update to retry.` });
  }
}

// Called after React commits; never mark a failed initial render as healthy.
export async function initOtaUpdates() {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;
  try {
    updater = (await import('@capgo/capacitor-updater')).CapacitorUpdater;
    controller = createOtaController(updater,
      () => document.visibilityState === 'visible' && applyGuard(), message => publish({
        message, phase: message === 'Your app is up to date.' ? 'current' : message.startsWith('Installing') ? 'installing' : message.startsWith('Update could') ? 'error' : 'ready', percent: null
      }));
    await updater.addListener('updateAvailable', info => controller.available(info?.bundle));
    await updater.addListener('download', info => {
      if (info?.bundle?.version === state.version) return;
      publish({ phase: 'downloading', message: 'Downloading update…', percent: Math.round(info.percent || 0) });
    });
    await updater.addListener('noNeedUpdate', () => {
      // Native also emits this after failures; only a successful explicit check
      // can clear an error, otherwise a failed download would look successful.
      if (!checking && !['error', 'ready', 'installing', 'downloading'].includes(state.phase)) publish({ phase: 'current', message: 'Your app is up to date.', checkedAt: Date.now(), percent: null });
    });
    await updater.addListener('downloadFailed', info => {
      if (info?.version === state.version) return;
      if (!checking && !['ready', 'installing'].includes(state.phase)) publish({ phase: 'error', message: 'The update check or download failed. Tap Get update to retry.', percent: null });
    });
    await updater.addListener('updateFailed', () => publish({ phase: 'error', message: 'The previous working version was restored. Tap Get update to retry.' }));
    await updater.notifyAppReady();
    const current = (await updater.current()).bundle;
    publish({ version: current.version });
    try {
      const next = await updater.getNextBundle();
      if (next?.id !== current.id && next?.version !== current.version) controller.available(next);
    } catch { /* older native shell */ }
    const check = () => {
      if (document.visibilityState === 'visible' && !['ready', 'installing', 'downloading'].includes(state.phase)) checkOtaUpdate();
    };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    setInterval(check, 5 * 60 * 1000);
    check();
  } catch (error) {
    publish({ phase: 'error', message: 'Automatic updates are unavailable in this installation.' });
    console.warn('[ota] updater unavailable:', error?.message || error);
  }
}

export async function getOtaVersion() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    return (await CapacitorUpdater.current())?.bundle?.version || null;
  } catch { return null; }
}
