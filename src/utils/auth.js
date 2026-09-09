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
    .select('id, email, full_name, role, is_active, created_at')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error) {
    console.warn('[auth] could not load profile:', error.message);
    return null;
  }
  return data;
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
