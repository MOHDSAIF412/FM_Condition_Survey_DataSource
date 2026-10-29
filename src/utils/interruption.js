import { deviceStorageScope } from './deviceAccount';

/**
 * Remembers the record that was open when the app went to the background.
 *
 * A phone call, the camera or Android reclaiming memory can end the app while
 * it is behind another screen. The work itself is in IndexedDB, but the
 * relaunch used to open on the module picker, so surveyors took the missing
 * form for lost data. A relaunch that finds this note reopens the record.
 *
 * Coming back to the app normally clears the note, so only an app that never
 * resumed is restored. The age limit stops an old note hijacking a launch.
 */
const KEY = 'fm_interrupted_record';
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function markRecordInterrupted(surveyId, tab) {
  if (!surveyId) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      surveyId, tab, accountId: deviceStorageScope().accountId, at: Date.now()
    }));
  } catch { /* private mode */ }
}

export function clearRecordInterrupted() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

/** Reads once and clears. Null unless it is this account's and recent. */
export function consumeRecordInterrupted(now = Date.now()) {
  try {
    const note = JSON.parse(localStorage.getItem(KEY) || 'null');
    localStorage.removeItem(KEY);
    if (!note?.surveyId || now - Number(note.at || 0) > MAX_AGE_MS) return null;
    if (note.accountId !== deviceStorageScope().accountId) return null;
    return { surveyId: note.surveyId, tab: note.tab };
  } catch {
    return null;
  }
}
