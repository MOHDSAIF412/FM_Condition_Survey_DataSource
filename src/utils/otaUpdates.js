import { Capacitor } from '@capacitor/core';
import { createOtaController } from './otaController';

let started = false;
let applyGuard = () => false;
let status = 'App updates download automatically while you are online.';
const listeners = new Set();
export const otaStatus = () => status;
export function subscribeOta(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function publish(message) { status = message; listeners.forEach(fn => fn()); }
export function allowOtaAtSafeScreen(guard) {
  applyGuard = guard;
  return () => { if (applyGuard === guard) applyGuard = () => false; };
}

// Called after React commits, so a broken initial render cannot bless a bundle.
export async function initOtaUpdates() {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;
  try {
    const { CapacitorUpdater: updater } = await import('@capgo/capacitor-updater');
    const controller = createOtaController(updater,
      () => document.visibilityState === 'visible' && applyGuard(), publish);
    await updater.addListener('updateAvailable', info => controller.available(info?.bundle));
    await updater.addListener('download', info => publish(`Downloading app update… ${Math.round(info.percent || 0)}%`));
    await updater.addListener('downloadFailed', () => publish('Update download will retry when you reconnect or reopen the app.'));
    await updater.addListener('updateFailed', () => publish('The previous working version was restored.'));
    await updater.notifyAppReady();
    // A download may have completed before React/listeners started.
    try { controller.available(await updater.getNextBundle()); } catch { /* older native shell */ }
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== 'visible' || navigator.onLine === false) return;
      checking = true;
      try { await updater.triggerUpdateCheck(); }
      catch { /* older shells still check automatically on foreground */ }
      finally { checking = false; }
    };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    setInterval(check, 5 * 60 * 1000);
    await check();
  } catch (error) {
    publish('Automatic updates are unavailable in this installation.');
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
