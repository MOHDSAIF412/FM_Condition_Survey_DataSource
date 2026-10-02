import { Capacitor } from '@capacitor/core';

let state = Capacitor.isNativePlatform() ? 'ready' : 'unavailable';
const listeners = new Set();
export const offlineShellState = () => state;
export function subscribeOfflineShell(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function publish(next) { state = next; listeners.forEach((fn) => fn(next)); }

export async function registerOfflineShell() {
  if (Capacitor.isNativePlatform() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  publish('preparing');
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing?.active) publish(existing.waiting ? 'update' : 'ready');
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    if (registration.active) publish('ready');
    if (registration.waiting) publish('update');
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && registration.active) publish('update');
      });
    });
    await navigator.serviceWorker.ready;
    if (state !== 'update') publish('ready');
  } catch (error) {
    if (state === 'preparing') publish('unavailable');
    console.info('Offline application cache unavailable:', error.message);
  }
}
