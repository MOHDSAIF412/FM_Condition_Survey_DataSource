/**
 * Offline-first IndexedDB Storage Engine
 * Handles large surveys and compressed photos with no 5MB localStorage limit.
 */

import { settleUpload } from './syncSettlement';
import { deviceStorageScope } from './deviceAccount';

const SYNC_CHANNEL = 'fm_survey_sync';

/**
 * Every open tab gets its own id, and every write bumps a revision counter.
 * Without this, a tab holding stale state silently overwrites newer work saved
 * by another tab -- e.g. add an asset in one tab, type one character in a tab
 * that was opened earlier, and the new asset is gone.
 */
const TAB_ID = 'tab_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * The revision this tab last saw, **per survey**.
 *
 * This used to be a single number shared by every survey, which silently broke
 * saving. The counter tracked whichever survey was last touched, so opening a
 * facility whose stored revision was higher than that number looked like
 * "another tab saved something newer" -- a conflict. The save was refused, the
 * caller's edits were dropped, and because the stored revision never moved, it
 * was refused again on every later save too. The facility became permanently
 * unsaveable and the work was gone on the next launch.
 *
 * Keyed by survey id, a comparison only ever happens against the same survey,
 * which is what the cross-tab guard actually meant.
 */
const lastKnownRevisions = new Map();

let syncChannel = null;
function getSyncChannel() {
  if (syncChannel !== null) return syncChannel;
  try {
    syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SYNC_CHANNEL) : false;
  } catch (e) {
    syncChannel = false;
  }
  return syncChannel;
}

/**
 * Notifies other tabs in this browser that the survey changed.
 * Does nothing across devices -- that needs a server.
 */
function broadcastChange(survey, scope) {
  const ch = getSyncChannel();
  if (!ch) return;
  try {
    ch.postMessage({ type: 'survey-saved', id: survey.id, revision: survey.revision, writerId: TAB_ID, accountId: scope.accountId });
  } catch (e) {
    // A closed channel is not worth failing a save over.
  }
}

/**
 * Calls back when another tab in this browser saves the survey, so the UI can
 * reload instead of showing stale data. Returns an unsubscribe function.
 */
export function subscribeToSurveyChanges(onExternalChange) {
  const accountId = deviceStorageScope().accountId;
  const ch = getSyncChannel();
  if (!ch) return () => {};
  const handler = (event) => {
    const msg = event.data;
    if (!msg || msg.type !== 'survey-saved') return;
    if ((msg.accountId || null) !== accountId) return;
    if (msg.writerId === TAB_ID) return; // our own write echoing back
    onExternalChange(msg);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
// Bumped to 2 for the sync_queue store. Every opener of this database must
// agree on the version, or the one asking for the lower number fails with a
// VersionError and the app cannot read its own data.
const DB_VERSION = 2;
const STORE_SURVEYS = 'surveys';
const STORE_SETTINGS = 'settings';

function openDB(scope = deviceStorageScope()) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(scope.database, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SURVEYS)) {
        db.createObjectStore(STORE_SURVEYS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      // Left in place although nothing writes to it any more: the module that
      // used it was never wired up and has been removed, but devices already
      // hold a database at this version containing the store. Dropping it from
      // the schema would mean a version bump, and an IndexedDB upgrade is not
      // something to risk against a phone holding unsynced survey work.
      if (!db.objectStoreNames.contains('sync_queue')) {
        const q = db.createObjectStore('sync_queue', { keyPath: 'id' });
        q.createIndex('status', 'status');
        q.createIndex('nextAttemptAt', 'nextAttemptAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Marks the locally stored survey as successfully pushed to the server.
 * Written directly rather than through React state so it cannot retrigger a save.
 */
export async function markSurveySynced(surveyId, uploaded, result) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SURVEYS, 'readwrite');
      const store = tx.objectStore(STORE_SURVEYS);
      const req = store.get(surveyId);
      let settled = false;
      req.onsuccess = () => {
        if (!req.result || !uploaded || !result?.pushed) return;
        const next = settleUpload(req.result, uploaded, result);
        store.put(next);
        settled = !next.pendingSync;
      };
      tx.oncomplete = () => resolve(settled);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Sync receipt could not be saved'));
    });
  } catch (e) {
    throw new Error('Could not save the upload receipt on this device.', { cause: e });
  }
}

export async function saveSurveyRecovery(survey) {
  const db = await openDB();
  const key = `recovery:${survey.id}:${crypto.randomUUID()}`;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, 'readwrite');
    tx.objectStore(STORE_SETTINGS).put({ key, survey, savedAt: new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Recovery backup failed'));
  });
  return key;
}

export async function listSurveyRecoveries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_SETTINGS, 'readonly').objectStore(STORE_SETTINGS).getAll();
    req.onsuccess = () => resolve(req.result.filter((r) => r.key.startsWith('recovery:')));
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {object} survey
 * @param {{pendingSync?: boolean}} [options] pendingSync marks local edits that
 *        have not reached the server yet, so a later startup does not let the
 *        server copy overwrite work done with no signal.
 */
export async function saveSurveyOffline(survey, options = {}) {
  const scope = deviceStorageScope();
  try {
    const db = await openDB(scope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SURVEYS, 'readwrite');
      const store = tx.objectStore(STORE_SURVEYS);

      // Read-then-write in one transaction so two tabs cannot interleave.
      const existingReq = store.get(survey.id);

      existingReq.onsuccess = () => {
        const existing = existingReq.result;
        const revisionKey = `${scope.database}:${survey.id}`;
        const seen = lastKnownRevisions.has(revisionKey)
          ? lastKnownRevisions.get(revisionKey)
          : null;

        // Another tab saved something newer than what this tab last saw.
        // Overwriting would destroy their work, so refuse and report back.
        //
        // `seen === null` means this tab has never read or written THIS survey
        // (it was just opened from the facility list, say). That is not a
        // conflict -- there is nothing of ours to lose -- so adopt whatever is
        // stored and carry on from there.
        if (existing && seen !== null && (existing.revision || 0) > seen) {
          resolve({ conflict: true, stored: existing });
          return;
        }

        const nextRevision = Math.max(existing?.revision || 0, seen || 0) + 1;
        const dataToSave = {
          ...survey,
          revision: nextRevision,
          writerId: TAB_ID,
          pendingSync: options.pendingSync === undefined ? true : options.pendingSync,
          updatedAt: new Date().toISOString()
        };
        const req = store.put(dataToSave);
        req.onsuccess = () => {
          lastKnownRevisions.set(revisionKey, nextRevision);
          broadcastChange(dataToSave, scope);
          // Also save active ID to localStorage for quick restore
          try {
            localStorage.setItem(scope.activeKey, survey.id);
            localStorage.setItem(scope.savedKey, new Date().toLocaleTimeString());
          } catch (e) {
            // ignore localStorage failure
          }
          resolve(dataToSave);
        };
        req.onerror = () => reject(req.error);
      };

      existingReq.onerror = () => reject(existingReq.error);
    });
  } catch (err) {
    console.error('Failed to save to IndexedDB, fallback to localStorage', err);
    try {
      localStorage.setItem(scope.fallbackKey, JSON.stringify(survey));
      return survey;
    } catch (lsErr) {
      console.error('LocalStorage also failed', lsErr);
      throw lsErr;
    }
  }
}

/**
 * One facility from this device, or null. Reads a single record: opening a
 * facility or building a report for many of them must not load every stored
 * facility's photos each time.
 */
export async function getSurveyOffline(id) {
  if (!id) return null;
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE_SURVEYS, 'readonly').objectStore(STORE_SURVEYS).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function loadCurrentSurveyOffline(defaultId = 'active_survey') {
  const scope = deviceStorageScope();
  try {
    const activeId = localStorage.getItem(scope.activeKey) || defaultId;
    const db = await openDB(scope);
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SURVEYS, 'readonly');
      const store = tx.objectStore(STORE_SURVEYS);
      const req = store.get(activeId);
      req.onsuccess = () => {
        if (req.result) {
          lastKnownRevisions.set(`${scope.database}:${req.result.id}`, req.result.revision || 0);
          resolve(req.result);
        } else {
          // Check if there is any survey in the store
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            if (allReq.result && allReq.result.length > 0) {
              lastKnownRevisions.set(`${scope.database}:${allReq.result[0].id}`, allReq.result[0].revision || 0);
              resolve(allReq.result[0]);
            } else {
              // Try fallback localStorage
              const fallback = localStorage.getItem(scope.fallbackKey);
              resolve(fallback ? JSON.parse(fallback) : null);
            }
          };
          allReq.onerror = () => resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Error reading from IndexedDB:', err);
    try {
      const fallback = localStorage.getItem(scope.fallbackKey);
      return fallback ? JSON.parse(fallback) : null;
    } catch (e) {
      return null;
    }
  }
}

export async function listAllSurveysOffline() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SURVEYS, 'readonly');
      const store = tx.objectStore(STORE_SURVEYS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

export async function deleteSurveyOffline(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SURVEYS, 'readwrite');
      const store = tx.objectStore(STORE_SURVEYS);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error(e);
  }
}
