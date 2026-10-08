import React, { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, RefreshCw } from 'lucide-react';
import { otaStatus, subscribeOta, checkOtaUpdate } from '../utils/otaUpdates';

export default function AutomaticUpdates() {
  const state = useSyncExternalStore(subscribeOta, otaStatus);
  if (!Capacitor.isNativePlatform()) return null;
  const busy = ['checking', 'downloading', 'ready', 'installing'].includes(state.phase);
  return <section aria-label="App updates" className="max-w-5xl mx-auto mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="font-bold text-[#293771]">App updates</h2>
        <p className="text-xs text-slate-500 mt-1">Installed version: {state.version || 'Checking…'}</p></div>
      <button type="button" disabled={busy} onClick={checkOtaUpdate} className="flex items-center gap-2 rounded-xl bg-[#293771] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />} {busy ? 'Updating…' : 'Get update'}
      </button>
    </div>
    <p role="status" className={`mt-3 text-sm ${state.phase === 'error' ? 'text-red-700' : 'text-slate-600'}`}>{state.message}</p>
    {state.phase === 'downloading' && <progress aria-label="Update download progress" className="mt-3 w-full" max="100" value={state.percent || 0} />}
    {state.checkedAt && <p className="text-xs text-slate-400 mt-2">Last checked: {new Date(state.checkedAt).toLocaleString()}</p>}
  </section>;
}
