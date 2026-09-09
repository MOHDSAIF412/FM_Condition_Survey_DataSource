import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import App from '../App';
import Login from './Login';
import { isCloudConfigured } from '../utils/supabaseClient';
import { getSession, onAuthChange, getMyProfile, signOut } from '../utils/auth';
import { isOnline, initNetworkMonitor, onNetworkChange } from '../utils/network';

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
      setSession(existing);
      if (existing) setProfile(await getMyProfile());
      setChecking(false);
    })();

    const unsubscribe = onAuthChange(async (next) => {
      setSession(next);
      setProfile(next ? await getMyProfile() : null);
    });

    return () => { cancelled = true; unsubscribe(); };
  }, []);

  if (!isCloudConfigured) return <App />;

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-ocs-600 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Login online={online} onSignedIn={setSession} />;
  }

  // A session exists but the profile row failed to load (offline on first
  // launch, or the row is still being created). Rather than lock the
  // surveyor out of an app they are correctly signed into, let them in with
  // no role assumed -- the admin-only screen simply will not offer itself.
  return (
    <App
      currentUser={profile ? { ...profile, sessionEmail: session.user?.email } : { id: session.user?.id, email: session.user?.email, role: 'user' }}
      onSignOut={async () => { await signOut(); setSession(null); setProfile(null); }}
    />
  );
}
