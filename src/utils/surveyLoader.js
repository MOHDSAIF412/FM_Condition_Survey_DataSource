import { pullSurvey, collectKnownPhotos, withTimeout } from './cloudSync';
import { getSurveyOffline } from './storage';
import { chooseSurveyToOpen } from './surveySelection';
import { isOnline } from './network';

/**
 * The copy of a facility to read or report from: the device copy when it holds
 * unsent edits, otherwise the server copy, falling back to the device copy with
 * no connection or when the server is too slow to answer.
 *
 * Reports used to take the server copy first, so one exported from the phone
 * silently left out every snag that had not uploaded yet.
 */
export async function loadSurveyForReading(surveyId, { waitMs = 8000 } = {}) {
  const local = await getSurveyOffline(surveyId);

  let remote = null;
  if (!(local && local.pendingSync) && isOnline()) {
    try {
      const pull = pullSurvey(surveyId, collectKnownPhotos(local));
      remote = local ? await withTimeout(pull, waitMs, 'Loading facility') : await pull;
    } catch (err) {
      console.info('Server copy unavailable, using the one on this device:', err?.message);
    }
  }
  return chooseSurveyToOpen(local, remote).survey;
}
