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
