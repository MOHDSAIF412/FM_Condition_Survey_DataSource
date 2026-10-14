import { getSurveyOffline } from './storage';
import { pullSurvey, collectKnownPhotos } from './cloudSync';
import { isCloudConfigured } from './supabaseClient';
import { isOnline } from './network';

export async function loadInitialInspection(id, {
  readLocal = getSurveyOffline,
  readRemote = pullSurvey,
  cloudEnabled = isCloudConfigured,
  online = isOnline()
} = {}) {
  const local = await readLocal(id);
  if (local) return { local, remote: null, error: null };
  if (!cloudEnabled || !online) return { local: null, remote: null, error: online ? null : new Error('offline') };
  try {
    return { local: null, remote: await readRemote(id, {}, { includePhotoBytes: false }), error: null };
  } catch (error) { return { local: null, remote: null, error }; }
}

// A refresh must still belong to this account/open operation and untouched copy.
export function canRefreshInspection(base, current, { dirty, request, latestRequest, account, currentAccount }) {
  return !!base && !base.pendingSync && current === base && !dirty
    && request === latestRequest && account === currentAccount;
}

export function refreshInspectionMetadata(record) {
  return pullSurvey(record.id, collectKnownPhotos(record), { includePhotoBytes: false });
}
