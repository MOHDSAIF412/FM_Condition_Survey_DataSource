import React, { useState } from 'react';
import { LogIn, Loader2, AlertCircle, WifiOff } from 'lucide-react';
import { signIn } from '../utils/auth';

/**
 * The one screen you see with no session. Everything else in the app is
 * behind this -- there is no route that skips it.
 */
export default function Login({ onSignedIn, online }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (!online) {
      setError('Signing in needs a connection. Once signed in, the app works offline all day.');
      return;
    }

    setBusy(true);
    try {
      const session = await signIn(email, password);
      if (session) onSignedIn(session);
    } catch (err) {
      setError(err.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocs-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img
            src="/ocs-logo-white.png"
            alt="OCS"
            className="h-10 mx-auto mb-4"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <h1 className="text-white text-xl font-bold">FM Condition Survey</h1>
          <p className="text-sky-200/70 text-xs mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl p-6 shadow-xl space-y-4">
          {!online && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
              No connection. Sign-in needs one; the app then works offline until you sign out.
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full px-5 py-3 rounded-xl bg-flame-500 hover:bg-flame-600 disabled:opacity-60 text-white font-bold text-sm inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {busy ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-[11px] text-slate-500 text-center">
            No account? Ask an administrator to create one for you.
          </p>
        </form>
      </div>
    </div>
  );
}
