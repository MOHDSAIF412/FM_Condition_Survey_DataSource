/**
 * Over-the-air updates for the Android app.
 *
 * The app is a web bundle inside a native shell, so a code change does not need
 * a new APK -- the phone can fetch the new bundle and swap it in. Only the
 * native shell (plugins, permissions, icons, Android config) still requires
 * reinstalling the APK.
 *
 * Flow, all handled by the plugin from capacitor.config.json:
 *   1. On launch it POSTs the current bundle version to /api/ota.
 *   2. If the server reports a newer version, the zip downloads in the
 *      background.
 *   3. It is applied the next time the app is launched -- deliberately not
 *      mid-session, so a surveyor never has the screen swapped out from under
 *      them while recording a snag.
 *
 * On the web this is inert: there is nothing to update, the page is already
 * whatever was last deployed.
 */
import { Capacitor } from '@capacitor/core';

let started = false;

export async function initOtaUpdates() {
  if (started) return;
  started = true;

  if (!Capacitor.isNativePlatform()) return;

  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');

    // Tells the plugin this bundle booted far enough to render. Without it the
    // bundle is considered failed and the previous one is restored on the next
    // launch. It must therefore only be called once the app is actually up.
    await CapacitorUpdater.notifyAppReady();

    CapacitorUpdater.addListener('updateAvailable', (info) => {
      console.info('[ota] update ready, applies on next launch:', info?.bundle?.version);
    });

    CapacitorUpdater.addListener('downloadFailed', (info) => {
      console.warn('[ota] download failed:', info);
    });

    CapacitorUpdater.addListener('updateFailed', (info) => {
      // The plugin rolls back on its own; this is only for visibility.
      console.warn('[ota] update failed, rolled back:', info?.bundle?.version);
    });
  } catch (err) {
    // A missing or misbehaving updater must never stop the survey app booting.
    console.warn('[ota] updater unavailable:', err?.message || err);
  }
}

/** Current bundle version, for showing in the UI. Null on web. */
export async function getOtaVersion() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const current = await CapacitorUpdater.current();
    return current?.bundle?.version || null;
  } catch {
    return null;
  }
}
