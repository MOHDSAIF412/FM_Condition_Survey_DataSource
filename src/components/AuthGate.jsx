import React, { useState, useEffect } from 'react';
import { FormsConfigProvider } from '../config/FormsConfigContext';
import { Loader2 } from 'lucide-react';
import App from '../App';
import Login from './Login';
import { isCloudConfigured } from '../utils/supabaseClient';
import { getSession, onAuthChange, getMyProfile, signOut, cachedProfile, clearCachedProfile, noteSignedInAccount } from '../utils/auth';
import { isOnline, initNetworkMonitor, onNetworkChange } from '../utils/network';
import { withTimeout } from '../utils/cloudSync';

/**
 * The profile for a session: fresh when the server answers within a few
 * seconds, otherwise the last one this device loaded for the same account.
 * With weak signal the request takes ~16s to fail, and the app sat on a
 * spinner for all of it before letting anyone in.
 */
async function loadProfile(session) {
  const userId = session?.user?.id;
  if (isOnline()) {
    try {
      const fresh = await withTimeout(getMyProfile(), 6000, 'Loading profile');
      if (fresh) return fresh;
    } catch { /* fall back to the cached profile */ }
  }
  return cachedProfile(userId);
}

/**
 * Everything in the app sits behind this. There is no route, tab, or view
 * that can be reached without a session -- App itself is only ever mounted
 * once one exists.
 *
 * On a build with no Supabase configured (VITE_SUPABASE_URL absent, e.g. a
 * throwaway local preview) auth is skipped entirely rather than locking the
 * developer out of a build that was never going to sync anywhere anyway.
 */
export default function AuthGate() {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [online, setOnline] = useState(isOnline());

  useEffect(() => {
    initNetworkMonitor().then(() => setOnline(isOnline()));
    return onNetworkChange(setOnline);
  }, []);

  useEffect(() => {
    if (!isCloudConfigured) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const existing = await getSession();
      if (cancelled) return;
      noteSignedInAccount(existing?.user?.id);
      setSession(existing);
      if (existing) setProfile(await loadProfile(existing));
      setChecking(false);
    })();

    const unsubscribe = onAuthChange(async (next) => {
      noteSignedInAccount(next?.user?.id);
      setSession(next);
      setProfile(next ? await loadProfile(next) : null);
    });

    return () => { cancelled = true; unsubscribe(); };
  }, []);

  if (!isCloudConfigured) return <FormsConfigProvider enabled={false}><App /></FormsConfigProvider>;

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-ocs-600 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Login online={online} onSignedIn={(s) => { noteSignedInAccount(s?.user?.id); setSession(s); }} />;
  }

  // A session exists but the profile row failed to load (offline on first
  // launch, or the row is still being created). Rather than lock the
  // surveyor out of an app they are correctly signed into, let them in with
  // no role assumed -- the admin-only screen simply will not offer itself.
  // The published form configuration (fields and rules set in the Admin
  // Dashboard) is loaded once signed in and cached for offline use.
  return (
    <FormsConfigProvider enabled>
      <App
        currentUser={profile ? { ...profile, sessionEmail: session.user?.email } : { id: session.user?.id, email: session.user?.email, role: 'user' }}
        onSignOut={async () => { await signOut(); clearCachedProfile(); setSession(null); setProfile(null); }}
      />
    </FormsConfigProvider>
  );
}
