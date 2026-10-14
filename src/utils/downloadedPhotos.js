// Downloaded photo bytes live separately from inspection rows, so filling a
// cache never changes report content, pending edits or sync revisions.
const databases = new Map();
function openCache(scope) {
  const name = `${scope.database}_downloaded_photos`;
  if (!databases.has(name)) {
    const opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'path' });
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databases.delete(name); };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => { databases.delete(name); throw error; });
    databases.set(name, opening);
  }
  return databases.get(name);
}
export async function readDownloadedPhoto(scope, path) {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openCache(scope);
    return await new Promise((resolve, reject) => {
      const request = db.transaction('photos').objectStore('photos').get(path);
      request.onsuccess = () => resolve(request.result?.dataUrl || null);
      request.onerror = () => reject(request.error);
    });
  } catch { return null; }
}
export async function storeDownloadedPhoto(scope, path, dataUrl) {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openCache(scope);
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('photos', 'readwrite');
      transaction.objectStore('photos').put({ path, dataUrl });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch { /* A full/disabled cache cannot make a downloaded photo disappear. */ }
}
