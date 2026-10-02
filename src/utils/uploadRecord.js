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
  const res = await push(record);
  // A stale revision is a conflict, never permission to overwrite newer data.
  if (res?.pushed) {
    const settled = await markSynced(record.id, record, res);
    return { ...res, pendingLocal: settled === false };
  }
  return res;
}
