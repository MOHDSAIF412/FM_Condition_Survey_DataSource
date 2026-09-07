/**
 * Connectivity monitoring.
 *
 * On Android the Network plugin reads the real connectivity state, which is
 * more trustworthy than navigator.onLine - the browser flag reports "online"
 * for any interface that is up, including a Wi-Fi network with no route out.
 * The browser events are used as the fallback on the web.
 */
import { Capacitor } from '@capacitor/core';

let currentlyOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
const listeners = new Set();

function emit(online) {
  if (online === currentlyOnline) return;
  currentlyOnline = online;
  for (const fn of listeners) {
    try { fn(online); } catch (e) { console.warn('network listener failed', e); }
  }
}

export function isOnline() {
  return currentlyOnline;
}

/** Subscribe to online/offline transitions. Returns an unsubscribe function. */
export function onNetworkChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function initNetworkMonitor() {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      currentlyOnline = status.connected;
      Network.addListener('networkStatusChange', (s) => emit(s.connected));
      return;
    } catch (err) {
      console.warn('[network] native monitor unavailable, using browser events:', err?.message);
    }
  }

  window.addEventListener('online', () => emit(true));
  window.addEventListener('offline', () => emit(false));
  currentlyOnline = navigator.onLine !== false;
}

/**
 * navigator.onLine and the native flag both only prove an interface is up.
 * This confirms something actually answers, which is what matters before
 * declaring a sync possible.
 */
export async function verifyReachable(url, timeoutMs = 6000) {
  if (!currentlyOnline) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
