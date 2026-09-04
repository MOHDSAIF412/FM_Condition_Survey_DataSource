/**
 * Offline-first IndexedDB Storage Engine
 * Handles large surveys and compressed photos with no 5MB localStorage limit.
 */

const DB_NAME = 'FM_Condition_Survey_DB';
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

export async function saveSurveyOffline(survey) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SURVEYS, 'readwrite');
      const store = tx.objectStore(STORE_SURVEYS);
      const dataToSave = {
        ...survey,
        updatedAt: new Date().toISOString()
      };
      const req = store.put(dataToSave);
      req.onsuccess = () => {
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
          resolve(req.result);
        } else {
          // Check if there is any survey in the store
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            if (allReq.result && allReq.result.length > 0) {
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
