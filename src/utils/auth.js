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
import { hasPermission } from './roles';

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

const PROFILE_CACHE_KEY = 'fm_profile_cache';

/**
 * The profile last loaded for this account, for use with no connection.
 *
 * Without it, opening the app offline left even an administrator with no role
 * and no permissions, so reports and deletion vanished exactly when working
 * from the device copy mattered most. Only returned for the same account id.
 * Deletion is still enforced by the database once back online; this restores
 * what the screen offers, not what the server allows.
 */
export function cachedProfile(userId) {
  if (!userId) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null');
    return cached && cached.id === userId ? cached : null;
  } catch {
    return null;
  }
}

// Lists cached for the account signed in last. Another account on the same
// device must not open onto them: each account sees only its own projects.
// Facility copies stored on the device are not touched -- they may hold unsent
// work -- and the list screens hide the ones the server no longer lists.
const ACCOUNT_CACHES = [
  'fm_survey_list_cache', 'fm_projects_cache', 'fm_portal_priority_cache', 'fm_portal_priority_by_survey',
  'fm_portal_activity_cache', 'fm_roles_cache'
];
const LAST_ACCOUNT_KEY = 'fm_last_account';

/** Call as an account signs in: clears the previous account's cached lists. */
export function noteSignedInAccount(userId) {
  if (!userId) return;
  try {
    const last = localStorage.getItem(LAST_ACCOUNT_KEY);
    if (last && last !== userId) ACCOUNT_CACHES.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(LAST_ACCOUNT_KEY, userId);
  } catch { /* storage unavailable */ }
}

export function clearCachedProfile() {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* nothing cached */ }
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
  if (data) {
    // The role's current permissions travel with the profile (and its cache),
    // so an administrator's change to a role reaches the screens on the next
    // load. Without it the built-in defaults apply.
    const { data: roleInfo, error: roleErr } = await supabase
      .from('fm_roles')
      .select('key, label, permissions, all_projects, approved_only, locked')
      .eq('key', data.role)
      .maybeSingle();
    if (roleErr) console.warn('[auth] role details unavailable, using defaults:', roleErr.message);
    else if (roleInfo) data.roleInfo = roleInfo;
    try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  }
  return data;
}

/**
 * Whether a user may do something: their role's permissions plus any extra
 * ones ticked for them. Administrators hold everything. Matches the database's
 * fm_can(), which refuses deactivated accounts too. See roles.js.
 */
export function can(user, permission) {
  return hasPermission(user, permission);
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
export async function createUser({ email, fullName, role, password, projectIds }) {
  return callAdminUsers('POST', { email, fullName, role, password, projectIds });
}

export async function deleteUser(userId) {
  return callAdminUsers('DELETE', { userId });
}

/**
 * Gives a user a new generated password, shown to the admin once. The recovery
 * route for someone locked out: it does not rely on email reaching them.
 * @returns {{user, password}}
 */
export async function resetUserPassword(userId) {
  return callAdminUsers('PATCH', { userId });
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
