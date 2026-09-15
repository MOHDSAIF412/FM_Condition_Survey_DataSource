/**
 * Login for the app.
 *
 * "Login once, then works offline" (the agreed model): supabase-js persists
 * the session to localStorage on its own, so a surveyor signs in once on wifi
 * and the session survives app restarts and dead zones without a repeat
 * login. The session is only ever revalidated against the server when a
 * request actually goes out -- nothing here requires a connection just to
 * open the app.
 */
import { supabase, isCloudConfigured, SUPABASE_URL } from './supabaseClient';

export async function getSession() {
  if (!isCloudConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('[auth] could not read session:', error.message);
    return null;
  }
  return data.session || null;
}

export function onAuthChange(callback) {
  if (!isCloudConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  if (!isCloudConfigured) throw new Error('Cloud sync is not configured on this build.');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: (email || '').trim().toLowerCase(),
    password: password || ''
  });
  if (error) {
    // Supabase's own wording ("Invalid login credentials") is fine to show
    // directly -- it never reveals which of email/password was wrong.
    throw new Error(error.message || 'Could not sign in.');
  }
  return data.session;
}

/** Changes the signed-in user's own password. Supabase re-derives the hash;
 *  the old password is never sent or stored anywhere in this app. */
export async function changePassword(newPassword) {
  if (!isCloudConfigured) throw new Error('Cloud sync is not configured on this build.');
  const password = (newPassword || '').trim();
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message || 'Could not change the password.');
}

export async function signOut() {
  if (!isCloudConfigured) return;
  await supabase.auth.signOut();
}

/** This device's own row in fm_survey_users -- name, role, active flag. */
export async function getMyProfile() {
  if (!isCloudConfigured) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data, error } = await supabase
    .from('fm_survey_users')
    .select('id, email, full_name, role, is_active, created_at, permissions')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error) {
    console.warn('[auth] could not load profile:', error.message);
    return null;
  }
  return data;
}

/**
 * Whether a user may do something. Admins hold everything: an administrator
 * locked out of deleting a snag would just change their own permission back,
 * so the tick boxes only ever describe ordinary surveyors.
 */
export function can(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.permissions?.[permission] === true;
}

/**
 * Calls the admin-users Edge Function -- the only place a login can be
 * created or removed. Every call carries this device's own session token, so
 * the function can verify admin status itself rather than trust the client.
 */
async function callAdminUsers(method, body) {
  if (!isCloudConfigured) throw new Error('Cloud sync is not configured on this build.');
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('You are not signed in.');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

export async function listUsers() {
  const { users } = await callAdminUsers('GET');
  return users || [];
}

/** @returns {{user, password}} the generated/entered password, shown once. */
export async function createUser({ email, fullName, role, password }) {
  return callAdminUsers('POST', { email, fullName, role, password });
}

export async function deleteUser(userId) {
  return callAdminUsers('DELETE', { userId });
}

/**
 * Permissions for every user, keyed by id.
 *
 * Read straight from the table rather than through the admin-users function:
 * the row-level policy already limits this to an admin (or your own row), so
 * there is nothing here a caller could not already see.
 */
export async function listUserPermissions() {
  if (!isCloudConfigured) return {};
  const { data, error } = await supabase
    .from('fm_survey_users')
    .select('id, role, permissions');
  if (error) {
    console.warn('[auth] could not load permissions:', error.message);
    return {};
  }
  const byId = {};
  for (const row of data || []) byId[row.id] = { role: row.role, permissions: row.permissions || {} };
  return byId;
}

/** Grants or revokes one permission. Admins already hold everything. */
export async function setUserPermission(userId, key, granted) {
  const { data: current, error: readErr } = await supabase
    .from('fm_survey_users')
    .select('permissions')
    .eq('id', userId)
    .maybeSingle();
  if (readErr) throw readErr;

  const next = { ...(current?.permissions || {}), [key]: granted };
  const { error } = await supabase
    .from('fm_survey_users')
    .update({ permissions: next })
    .eq('id', userId);
  if (error) throw error;
  return next;
}
