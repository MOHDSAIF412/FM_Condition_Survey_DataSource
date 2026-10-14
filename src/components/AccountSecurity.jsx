import { diagnosticEvents } from '../utils/diagnostics';
import { saveText } from '../utils/fileSaver';
import React, { useEffect, useState, useRef } from 'react';
import { mfaFactors, enrollMfa, verifyMfa } from '../utils/mfa';
import { isCloudConfigured, supabase } from '../utils/supabaseClient';

export default function AccountSecurity({ challenge = false, session, onClose, onSignOut, onBackup, onRestore, onBusyChange }) {
  const box = useRef(null), pendingEnrollment = useRef(null);
  useEffect(() => () => { if (pendingEnrollment.current && isCloudConfigured) supabase.auth.mfa.unenroll({ factorId: pendingEnrollment.current }).catch(() => {}); }, []);
  const [factor, setFactor] = useState(null), [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => {
    if (!isCloudConfigured) return;
    let active = true;
    mfaFactors().then(factors => { if (active) setFactor(factors.find(f => f.status === 'verified') || null); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  const act = async fn => { setBusy(true); setError(''); try { await fn(); } catch(e) { setError(e.message || 'Try again when connected.'); } finally { setBusy(false); } };
  const start = () => act(async () => { const next = await enrollMfa(); pendingEnrollment.current = next.id; setEnrollment(next); });
  const verify = () => act(async () => {
    const id = enrollment?.id || factor?.id || session?.user?.factors?.find(f => f.status === 'verified')?.id;
    if (!id) throw new Error('Reconnect to load your authenticator.');
    await verifyMfa(id, code); pendingEnrollment.current = null; setEnrollment(null); setCode(''); setMessage('Two-factor authentication is enabled.');
    setFactor({ id, status: 'verified' }); if (challenge) onClose?.();
  });
  const close = () => act(async () => {
    if (enrollment) await supabase.auth.mfa.unenroll({ factorId: enrollment.id });
    pendingEnrollment.current = null; setEnrollment(null); onClose?.();
  });
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    const previous = document.activeElement;
    box.current?.querySelector('input, button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const trap = e => {
    if (e.key === 'Escape' && !challenge && !busy) { e.preventDefault(); close(); }
    if (e.key !== 'Tab') return;
    const nodes = [...(box.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),summary') || [])].filter(el => el.getClientRects().length);
    if (!nodes.length) return;
    if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1).focus(); }
    if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus(); }
  };
  return <div onKeyDown={trap} className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="security-title">
    <section ref={box} className="w-full max-w-lg bg-white rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl max-h-[90dvh] overflow-y-auto">
      <h2 id="security-title" className="font-bold text-xl text-ocs-600">{challenge ? 'Verify your sign-in' : 'Account security'}</h2>
      <p className="text-sm text-slate-600">{challenge ? 'Enter the code from your authenticator to open your workspace.' : 'Protect your account with an authenticator app. Keep access to it for future sign-ins.'}</p>
      {!challenge && !enrollment && <p className="rounded-xl border p-3 text-sm">Two-factor authentication: <strong>{factor ? 'Enabled' : 'Not enabled'}</strong></p>}
      {!challenge && !factor && !enrollment && <button type="button" disabled={busy || !isCloudConfigured} onClick={start} className="min-h-11 rounded-xl bg-ocs-600 text-white px-4 text-sm font-semibold">Set up two-factor authentication</button>}
      {enrollment && <div className="space-y-3"><p className="text-sm">Scan this code with your authenticator app, then enter its six-digit code.</p><img src={enrollment.totp.qr_code} alt="Authenticator setup QR code" className="w-48 h-48 mx-auto"/><details><summary className="text-sm text-ocs-600 cursor-pointer">Enter setup key manually</summary><code className="block p-3 text-xs break-all select-all">{enrollment.totp.secret}</code></details></div>}
      {(challenge || enrollment) && <form onSubmit={e => { e.preventDefault(); verify(); }} className="space-y-3"><label className="block text-sm font-semibold">Authenticator code<input autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))} className="block w-full min-h-12 border rounded-xl px-4 mt-2 text-lg tracking-widest"/></label><button type="submit" disabled={busy || code.length !== 6} className="min-h-11 rounded-xl bg-ocs-600 text-white px-4 font-semibold disabled:opacity-50">{busy ? 'Verifying…' : 'Verify code'}</button></form>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!challenge && onBackup && <div className="border-t pt-4"><h3 className="font-semibold text-sm">Device backup</h3><p className="text-xs text-slate-500 mt-1">Download a backup of this account’s saved device records, including unsent drafts and photos. Store it privately.</p><button type="button" disabled={busy} onClick={() => act(async () => { await onBackup(); setMessage('Device backup prepared. Keep the downloaded file privately.'); })} className="min-h-11 text-sm font-semibold text-ocs-600">Download device backup</button></div>}
      {!challenge && onRestore && <label className="block text-sm font-semibold text-ocs-600">Restore missing device records<input type="file" accept="application/json,.json" disabled={busy} className="block w-full text-xs mt-2" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; act(async () => { if (file.size > 100 * 1024 * 1024) throw new Error('Choose a backup smaller than 100 MB.'); const result = await onRestore(JSON.parse(await file.text())); setMessage(`Restored ${result.restored} missing records. Kept ${result.kept} existing copies unchanged.`); }); }}/><span className="block text-xs font-normal text-slate-500 mt-1">Existing records are kept. Restoration never replaces newer work.</span></label>}
      {!challenge && <div className="border-t pt-3"><h3 className="font-semibold text-sm">Troubleshooting</h3><p className="text-xs text-slate-500 mt-1">{diagnosticEvents().length} recent error events. Diagnostics contain categories and times only.</p><button type="button" disabled={busy} className="min-h-11 text-sm font-semibold text-ocs-600" onClick={() => act(() => saveText(JSON.stringify({ events: diagnosticEvents(), exportedAt: new Date().toISOString() },null,2),'OCS_Diagnostics.json'))}>Download diagnostics</button></div>}
      <div className="border-t pt-3 flex justify-end gap-3">{challenge ? <button type="button" disabled={busy} onClick={onSignOut} className="min-h-11 text-sm font-semibold text-slate-600">Sign out</button> : <button type="button" disabled={busy} onClick={close} className="min-h-11 rounded-xl border px-4 text-sm font-semibold">Close</button>}</div>
    </section>
  </div>;
}
