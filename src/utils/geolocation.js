/**
 * Device location capture.
 *
 * Why this exists rather than calling navigator.geolocation directly: on
 * Android the WebView's geolocation API is gated by the app's manifest
 * permissions. Those were never declared, so every request failed silently and
 * the coordinates simply never arrived. The Capacitor Geolocation plugin goes
 * through the native location service and can request the runtime permission
 * explicitly, so failures are visible and recoverable instead of silent.
 *
 * GPS itself needs no network, so this works offline. The fix reads the
 * satellite position on the device; only syncing the result needs a connection.
 */
import { Capacitor } from '@capacitor/core';

/** Distinguishes "denied" from "no fix yet" so the UI can say something useful. */
export const GPS_STATUS = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  CAPTURED: 'captured',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  TIMEOUT: 'timeout',
  ERROR: 'error'
};

const OPTIONS = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0 // never hand back a stale fix - a survey needs where you are now
};

function normalise(position) {
  const c = position.coords || {};
  return {
    latitude: Number(c.latitude).toFixed(6),
    longitude: Number(c.longitude).toFixed(6),
    accuracy: c.accuracy != null ? Math.round(c.accuracy) : null,
    altitude: c.altitude != null ? Math.round(c.altitude) : null,
    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
    mapsUrl: `https://www.google.com/maps?q=${c.latitude},${c.longitude}`,
    source: Capacitor.isNativePlatform() ? 'device-gps' : 'browser'
  };
}

function classify(err) {
  const code = err && err.code;
  const msg = String((err && err.message) || '').toLowerCase();

  if (code === 1 || msg.includes('denied') || msg.includes('permission')) {
    return { status: GPS_STATUS.DENIED,
      message: 'Location permission denied. Enable location for this app in Settings, then retry.' };
  }
  if (code === 2 || msg.includes('unavailable') || msg.includes('disabled')) {
    return { status: GPS_STATUS.UNAVAILABLE,
      message: 'Location is switched off or has no signal. Turn GPS on, move outdoors, then retry.' };
  }
  if (code === 3 || msg.includes('timeout') || msg.includes('timed out')) {
    return { status: GPS_STATUS.TIMEOUT,
      message: 'Could not get a fix in time. Indoors or under cover this can take a while - retry outside.' };
  }
  return { status: GPS_STATUS.ERROR,
    message: (err && err.message) || 'Could not read the device location.' };
}

/**
 * Reads the current position.
 * Always resolves - never throws - so a refused or failed fix can never block
 * the survey. Callers branch on `ok`.
 */
export async function captureLocation() {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import('@capacitor/geolocation');

      // Ask explicitly. Without this the native call rejects on Android 6+
      // with no prompt ever shown to the surveyor.
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        perm = await Geolocation.requestPermissions({ permissions: ['location'] });
      }
      if (perm.location === 'denied' && perm.coarseLocation === 'denied') {
        return { ok: false, ...classify({ code: 1 }) };
      }

      const position = await Geolocation.getCurrentPosition(OPTIONS);
      return { ok: true, status: GPS_STATUS.CAPTURED, location: normalise(position) };
    }

    // Browser
    if (!('geolocation' in navigator)) {
      return { ok: false, status: GPS_STATUS.UNAVAILABLE,
        message: 'This browser does not provide location.' };
    }
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, OPTIONS);
    });
    return { ok: true, status: GPS_STATUS.CAPTURED, location: normalise(position) };
  } catch (err) {
    return { ok: false, ...classify(err) };
  }
}
