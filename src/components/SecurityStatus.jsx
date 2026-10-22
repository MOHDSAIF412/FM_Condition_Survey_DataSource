import React, { useEffect, useState } from 'react';
import { isCloudConfigured, supabase } from '../utils/supabaseClient';

export default function SecurityStatus() {
  const [summary, setSummary] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const refresh = async () => {
    setBusy(true); setError('');
    try {
      const { data, error: failure } = await supabase.rpc('fm_security_summary');
      if (failure) {
        if (failure.code === '42501') { setSummary(null); return; }
        throw failure;
      }
      setSummary(data);
    } catch { setError('Security status could not be refreshed.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (isCloudConfigured) refresh(); }, []);
  if (!summary) return null;
  const missingMfa = summary.active_admins - summary.admins_with_mfa;
  return <div className="border-t pt-4 space-y-2 text-sm">
    <h3 className="font-semibold">Administrator security status</h3>
    {missingMfa > 0 && <p role="alert" className="text-amber-800">{missingMfa} administrator account(s) still need two-factor authentication.</p>}
    <p>{summary.admins_with_mfa} of {summary.active_admins} administrators have MFA enabled.</p>
    <p>AI requests today (UTC): {summary.ai_allowed_today} allowed, {summary.ai_blocked_today} blocked.</p>
    {summary.ai_blocked_today > 0 && <p role="alert" className="text-amber-800">Request limits were reached today. Review Vercel function logs for ai_rate_limited events.</p>}
    <p className="text-xs text-slate-500">AI limits: {summary.per_account_minute}/minute and {summary.per_account_day}/day per account; {summary.global_day}/day across the app. These limits do not measure total app capacity.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button type="button" disabled={busy} onClick={refresh} className="min-h-11 font-semibold text-ocs-600">{busy ? 'Refreshing…' : 'Refresh security status'}</button>
  </div>;
}
