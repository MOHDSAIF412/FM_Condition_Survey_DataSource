/**
 * Whether a failed request was refused for want of a valid sign-in, rather
 * than for want of a connection.
 *
 * The database requires a signed-in user, so an expired session fails every
 * upload. Reporting that as "waiting to sync" tells a surveyor their work is
 * queued when nothing will upload until they sign in again.
 */
export function isAuthFailure(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err || '').toLowerCase();
  return err.status === 401
    || code === '42501' || code === 'PGRST301'
    || msg.includes('jwt') || msg.includes('not authenticated')
    || msg.includes('row-level security') || msg.includes('permission denied');
}

/**
 * Whether the database refused the request under its access rules: the
 * account is signed in, but its role or project team does not allow this
 * change. Still counted by isAuthFailure (a lost session looks the same from
 * here), so callers that know a user is signed in check this first.
 */
export function isAccessRefused(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err || '').toLowerCase();
  return code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')
    || msg.startsWith('refused:');
}
