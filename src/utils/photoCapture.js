/**
 * Photo capture.
 *
 * ROOT CAUSE of "the app jumps back to the facility page after taking a photo":
 *
 * A bare `<input type="file" capture>` hands control to the system camera app.
 * The Capacitor Activity goes to the background, and Android routinely destroys
 * a backgrounded Activity to free memory - camera apps are among the hungriest
 * things a phone runs, so this happens constantly on mid-range devices. When
 * the camera returns, the Activity is recreated, the WebView reloads the page
 * from scratch and React remounts. Because the active tab lived only in
 * component state (`useState('facility')`), the app came back on the Facility
 * screen. And because saving was debounced by 600ms, a photo added just before
 * the process died had never been written, so it was gone too.
 *
 * It was never a UI bug. Three things fix it, and all three are needed:
 *   1. Use the Camera plugin, which registers a proper activity-result handler
 *      and hands the picture back even after the Activity was recreated.
 *   2. Persist the photo synchronously on capture, not on a debounce.
 *   3. Persist the active tab, so a recreated Activity returns where it was.
 *
 * Every photo gets a UUID at creation. Identity never depends on the filename,
 * so two shots taken in the same second cannot collide or overwrite each other.
 */
import { Capacitor } from '@capacitor/core';
import { compressImage } from './imageCompressor';

export const PHOTO_SYNC = {
  LOCAL: 'local',       // saved on the device, not sent yet
  PENDING: 'pending',   // queued, waiting for a connection
  UPLOADING: 'uploading',
  SYNCED: 'synced',
  FAILED: 'failed'
};

/**
 * Marks that the camera is in front, so a relaunch can tell "Android killed us
 * mid-capture" apart from "the surveyor opened the app".
 *
 * Point 3 above requires the recreated Activity to return to the tab it was on.
 * Restoring that tab on *every* launch is what made the app open on whatever
 * screen was last used, instead of the first page of the inspection.
 */
const CAPTURE_FLAG = 'fm_capture_in_flight';

function markCaptureStarted() {
  try { localStorage.setItem(CAPTURE_FLAG, String(Date.now())); } catch { /* private mode */ }
}

function markCaptureFinished() {
  try { localStorage.removeItem(CAPTURE_FLAG); } catch { /* private mode */ }
}

/**
 * True when this launch is a return from a capture that never came back --
 * i.e. the Activity was destroyed while the camera was open.
 *
 * Reads once and clears: a flag left behind by a capture that died must not
 * keep hijacking the opening screen on every later launch. The age check is a
 * second guard for the same thing.
 */
export function consumeCaptureReturn() {
  try {
    const started = Number(localStorage.getItem(CAPTURE_FLAG) || 0);
    localStorage.removeItem(CAPTURE_FLAG);
    return started > 0 && Date.now() - started < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Collision-resistant id. crypto.randomUUID where available, otherwise random
 * bytes - never the filename, and never a bare timestamp, since a burst of
 * photos can share a millisecond.
 */
export function newPhotoId() {
  try {
    if (globalThis.crypto?.randomUUID) return `photo_${globalThis.crypto.randomUUID()}`;
    const b = new Uint8Array(16);
    globalThis.crypto.getRandomValues(b);
    return `photo_${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function buildPhoto({ dataUrl, name, width, height }) {
  return {
    id: newPhotoId(),
    dataUrl,
    name: name || 'photo.jpg',
    width: width || null,
    height: height || null,
    caption: '',
    timestamp: new Date().toISOString(),
    syncStatus: PHOTO_SYNC.LOCAL,
    storagePath: null
  };
}

/** Reduces a native base64 payload through the same compression as file input. */
async function compressBase64(base64, mime = 'image/jpeg') {
  const res = await fetch(`data:${mime};base64,${base64}`);
  const blob = await res.blob();
  const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
  return compressImage(file);
}

/**
 * Turns a native plugin failure into something a surveyor can act on.
 *
 * "not implemented on android" means the camera plugin is absent from the
 * installed APK. Over-the-air updates only swap the web bundle, so this can
 * only be fixed by reinstalling the app -- worth saying plainly, since the raw
 * message reads like the survey itself is broken.
 */
function describeNativeFailure(msg) {
  if (/not implemented|unimplemented|plugin is not/i.test(msg)) {
    return 'This installed app version has no camera support. Reinstall the latest APK - an over-the-air update cannot add it.';
  }
  return msg;
}

/**
 * Opens the camera. Native only.
 * Resolves { ok, photo } or { ok:false, cancelled|message } - never throws, so
 * a refused permission cannot interrupt the inspection.
 */
export async function captureFromCamera() {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, message: 'Camera capture is only available in the app.' };
  }
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

    let perm = await Camera.checkPermissions();
    if (perm.camera !== 'granted') {
      perm = await Camera.requestPermissions({ permissions: ['camera'] });
    }
    if (perm.camera === 'denied') {
      return { ok: false, message: 'Camera permission denied. Enable it in Settings to take photos.' };
    }

    markCaptureStarted();
    const shot = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      correctOrientation: true,
      // Keeping the returned image modest reduces the chance Android needs to
      // reclaim memory from us in the first place.
      width: 1600
    });

    const compressed = await compressBase64(shot.base64String, `image/${shot.format || 'jpeg'}`);
    return { ok: true, photo: buildPhoto(compressed) };
  } catch (err) {
    const msg = String(err?.message || err);
    if (/cancel/i.test(msg)) return { ok: false, cancelled: true };
    return { ok: false, message: describeNativeFailure(msg) };
  } finally {
    // Reached only if the Activity survived. If Android killed it, the flag
    // stays set -- which is exactly how the next launch knows to restore.
    markCaptureFinished();
  }
}

/** Opens the system photo picker. Native only. Supports multiple selection. */
export async function pickFromGallery() {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, message: 'Gallery picking is only available in the app.' };
  }
  try {
    const { Camera } = await import('@capacitor/camera');
    markCaptureStarted();
    const result = await Camera.pickImages({ quality: 85, limit: 10, width: 1600 });

    const photos = [];
    for (const file of result.photos || []) {
      try {
        const res = await fetch(file.webPath);
        const blob = await res.blob();
        const f = new File([blob], `gallery_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
        photos.push(buildPhoto(await compressImage(f)));
      } catch (e) {
        console.warn('[photo] skipped an unreadable gallery image:', e?.message);
      }
    }
    if (!photos.length) return { ok: false, cancelled: true };
    return { ok: true, photos };
  } catch (err) {
    const msg = String(err?.message || err);
    if (/cancel/i.test(msg)) return { ok: false, cancelled: true };
    return { ok: false, message: describeNativeFailure(msg) };
  } finally {
    markCaptureFinished();
  }
}

/** Browser path: turns picked File objects into photo records. */
export async function photosFromFiles(files) {
  const photos = [];
  for (const file of Array.from(files || [])) {
    try {
      photos.push(buildPhoto(await compressImage(file)));
    } catch (e) {
      console.warn('[photo] could not process', file?.name, e?.message);
    }
  }
  return photos;
}
