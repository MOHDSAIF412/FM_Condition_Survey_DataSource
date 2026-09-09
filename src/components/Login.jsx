import React, { useState } from 'react';
import { LogIn, Loader2, AlertCircle, WifiOff, Mail, Lock, ShieldCheck, ClipboardCheck, Camera } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-br from-ocs-800 via-ocs-800 to-slate-900 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl bg-white/[0.03] sm:bg-transparent rounded-[2rem] overflow-hidden grid grid-cols-1 lg:grid-cols-2 shadow-2xl">

        {/* Left: branding panel -- only on wide screens, so the phone keeps
            the tighter single-column layout that already worked. */}
        <div className="hidden lg:flex relative flex-col justify-between p-10 bg-white/5 border border-white/10 rounded-l-[2rem] overflow-hidden">
          <Camera className="absolute -right-10 -bottom-10 w-72 h-72 text-white/5 rotate-12 pointer-events-none" />

          <div className="relative">
            <img
              src="/ocs-logo-white.png"
              alt="OCS"
              className="h-9 mb-10"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <h1 className="text-white text-3xl font-bold leading-tight">
              FM Condition<br />Survey
            </h1>
            <p className="text-sky-200/70 text-sm mt-3 max-w-xs">
              Record snags, capture GPS and photos, and generate audit-ready
              reports — even with no signal on site.
            </p>
          </div>

          <div className="relative space-y-4">
            {[
              { icon: ShieldCheck, text: 'Offline-first: works all day with no connection' },
              { icon: ClipboardCheck, text: 'Project → Facility → Survey, always organised' },
              { icon: Camera, text: 'Photos and reports sync the moment you’re back online' }
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-center gap-3 text-sky-100/90 text-sm">
                <span className="p-2 rounded-xl bg-white/10 shrink-0">
                  <Icon className="w-4 h-4 text-sky-300" />
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Right: the actual form */}
        <div className="bg-white p-8 sm:p-10 rounded-[2rem] lg:rounded-l-none flex flex-col justify-center">
          <div className="lg:hidden text-center mb-8">
            <img
              src="/ocs-logo.png"
              alt="OCS"
              className="h-9 mx-auto mb-4"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <h1 className="text-slate-900 text-xl font-bold">FM Condition Survey</h1>
          </div>

          <h2 className="hidden lg:block text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="text-slate-500 text-sm mt-1 mb-7">Sign in to continue to your projects.</p>

          <form onSubmit={submit} className="space-y-5">
            {!online && (
              <div className="flex items-start gap-2 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
                No connection. Sign-in needs one; the app then works offline until you sign out.
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full px-5 py-3.5 rounded-xl bg-flame-500 hover:bg-flame-600 active:scale-[0.99] disabled:opacity-60 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-card transition-[background-color,transform] duration-150"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {busy ? 'Signing in…' : 'Sign In'}
            </button>

            <p className="text-[12px] text-slate-500 text-center pt-1">
              No account? Ask an administrator to create one for you.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
