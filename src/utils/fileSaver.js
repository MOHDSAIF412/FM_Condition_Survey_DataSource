/**
 * Cross-platform file saving.
 *
 * In a browser we can hand the user a Blob through an <a download> link.
 * Inside the Android WebView that link silently does nothing, so on native we
 * write the file to the app's Documents directory and open the system share
 * sheet, which lets the surveyor send it to WhatsApp, email, Drive or Files.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

/** Strips the "data:<mime>;base64," prefix, returning raw base64. */
function toBase64(dataUrl) {
  const marker = 'base64,';
  const idx = dataUrl.indexOf(marker);
  return idx === -1 ? dataUrl : dataUrl.slice(idx + marker.length);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(toBase64(String(reader.result)));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Browser path: trigger a normal download. */
function saveViaAnchor(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Native path: write to Documents, then offer the share sheet. */
async function saveViaFilesystem(blob, filename, shareTitle) {
  const data = await blobToBase64(blob);

  // Directory.External is app-scoped external storage (getExternalFilesDir).
  // Directory.Documents maps to the PUBLIC Documents folder, which scoped
  // storage blocks on Android 11+, so it would fail on any modern phone.
  const written = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.External,
    recursive: true
  });

  try {
    await Share.share({
      title: shareTitle || filename,
      text: filename,
      url: written.uri,
      dialogTitle: 'Share report'
    });
  } catch (err) {
    // The user dismissing the share sheet is not a failure — the file is saved.
    console.info('Share sheet closed; file saved to', written.uri);
  }

  return written.uri;
}

/**
 * Saves a Blob, choosing the right mechanism for the platform.
 * Returns the native file URI, or null in the browser.
 */
export async function saveBlob(blob, filename, shareTitle) {
  if (isNativeApp()) {
    return saveViaFilesystem(blob, filename, shareTitle);
  }
  saveViaAnchor(blob, filename);
  return null;
}

/** Convenience wrapper for saving text (JSON backups). */
export async function saveText(text, filename, mimeType = 'application/json', shareTitle) {
  return saveBlob(new Blob([text], { type: mimeType }), filename, shareTitle);
}
