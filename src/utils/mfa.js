import { supabase } from './supabaseClient';

export async function mfaFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp || [];
}
export async function enrollMfa() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${crypto.randomUUID().slice(0,8)}` });
  if (error) throw error;
  return data;
}
export async function verifyMfa(factorId, code) {
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit code from your authenticator.');
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
}
export function needsMfa(session) {
  if (!(session?.user?.factors || []).some(f => f.status === 'verified')) return false;
  try { return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).aal !== 'aal2'; }
  catch { return true; }
}
