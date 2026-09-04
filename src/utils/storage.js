/**
 * Offline-first IndexedDB Storage Engine
 * Handles large surveys and compressed photos with no 5MB localStorage limit.
 */

const DB_NAME = 'FM_Condition_Survey_DB';
const SYNC_CHANNEL = 'fm_survey_sync';

/**
 * Every open tab gets its own id, and every write bumps a revision counter.
 * Without this, a tab holding stale state silently overwrites newer work saved
 * by another tab -- e.g. add an asset in one tab, type one character in a tab
 * that was opened earlier, and the new asset is gone.
 */
const TAB_ID = 'tab_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
let lastKnownRevision = 0;

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
function broadcastChange(survey) {
  const ch = getSyncChannel();
  if (!ch) return;
  try {
    ch.postMessage({ type: 'survey-saved', id: survey.id, revision: survey.revision, writerId: TAB_ID });
  } catch (e) {
    // A closed channel is not worth failing a save over.
  }
}

/**
 * Calls back when another tab in this browser saves the survey, so the UI can
 * reload instead of showing stale data. Returns an unsubscribe function.
 */
export function subscribeToSurveyChanges(onExternalChange) {
  const ch = getSyncChannel();
  if (!ch) return () => {};
  const handler = (event) => {
    const msg = event.data;
    if (!msg || msg.type !== 'survey-saved') return;
    if (msg.writerId === TAB_ID) return; // our own write echoing back
    onExternalChange(msg);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
const DB_VERSION = 1;
const STORE_SURVEYS = 'surveys';
const STORE_SETTINGS = 'settings';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SURVEYS)) {
        db.createObjectStore(STORE_SURVEYS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
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
export async function markSurveySynced(surveyId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SURVEYS, 'readwrite');
      const store = tx.objectStore(STORE_SURVEYS);
      const req = store.get(surveyId);
      req.onsuccess = () => {
        if (!req.result) return resolve(false);
        store.put({ ...req.result, pendingSync: false });
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

/**
 * @param {object} survey
 * @param {{pendingSync?: boolean}} [options] pendingSync marks local edits that
 *        have not reached the server yet, so a later startup does not let the
 *        server copy overwrite work done with no signal.
 */
export async function saveSurveyOffline(survey, options = {}) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SURVEYS, 'readwrite');
      const store = tx.objectStore(STORE_SURVEYS);

      // Read-then-write in one transaction so two tabs cannot interleave.
      const existingReq = store.get(survey.id);

      existingReq.onsuccess = () => {
        const existing = existingReq.result;

        // Another tab saved something newer than what this tab last saw.
        // Overwriting would destroy their work, so refuse and report back.
        if (existing && (existing.revision || 0) > lastKnownRevision) {
          resolve({ conflict: true, stored: existing });
          return;
        }

        const nextRevision = Math.max(existing?.revision || 0, lastKnownRevision) + 1;
        const dataToSave = {
          ...survey,
          revision: nextRevision,
          writerId: TAB_ID,
          pendingSync: options.pendingSync === undefined ? true : options.pendingSync,
          updatedAt: new Date().toISOString()
        };
        const req = store.put(dataToSave);
        req.onsuccess = () => {
          lastKnownRevision = nextRevision;
          broadcastChange(dataToSave);
          // Also save active ID to localStorage for quick restore
          try {
            localStorage.setItem('fm_active_survey_id', survey.id);
            localStorage.setItem('fm_last_saved', new Date().toLocaleTimeString());
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
      localStorage.setItem('fm_current_survey', JSON.stringify(survey));
      return survey;
    } catch (lsErr) {
      console.error('LocalStorage also failed', lsErr);
      throw lsErr;
    }
  }
}

export async function loadCurrentSurveyOffline(defaultId = 'active_survey') {
  try {
    const activeId = localStorage.getItem('fm_active_survey_id') || defaultId;
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SURVEYS, 'readonly');
      const store = tx.objectStore(STORE_SURVEYS);
      const req = store.get(activeId);
      req.onsuccess = () => {
        if (req.result) {
          lastKnownRevision = req.result.revision || 0;
          resolve(req.result);
        } else {
          // Check if there is any survey in the store
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            if (allReq.result && allReq.result.length > 0) {
              lastKnownRevision = allReq.result[0].revision || 0;
              resolve(allReq.result[0]);
            } else {
              // Try fallback localStorage
              const fallback = localStorage.getItem('fm_current_survey');
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
      const fallback = localStorage.getItem('fm_current_survey');
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
