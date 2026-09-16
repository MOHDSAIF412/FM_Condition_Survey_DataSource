/**
 * Uploads one stored facility and marks it synced only if the server took it.
 *
 * The submit paths used to push and then mark the facility synced regardless.
 * A refused push returns a result rather than throwing, so a conflicting
 * submission was flagged as uploaded, never retried, and never reached the
 * server. Network and sign-in failures still throw, leaving it unsent.
 *
 * `push` and `markSynced` are passed in so the rule can be tested without a
 * database.
 */
export async function uploadSurveyRecord(record, { push, markSynced }) {
  let res = await push(record);

  // The server moved on while this device was offline. The push is an upsert
  // with explicit tombstones, so re-basing merges this device's work in without
  // deleting anything already there.
  if (res && res.conflict && res.reason === 'stale' && res.serverRevision !== undefined) {
    res = await push({ ...record, cloudRevision: res.serverRevision });
  }
  if (res && res.pushed) await markSynced(record.id);
  return res;
}
