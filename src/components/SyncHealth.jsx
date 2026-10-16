import React, { useEffect, useState } from 'react';
import { diagnosticEvents, latestSyncProblem, recordDiagnostic } from '../utils/diagnostics';
export default function SyncHealth({ online, syncState, onReview }) {
  const [failing, setFailing] = useState(false);
  useEffect(() => {
    if (online && ['offline','error'].includes(syncState)) recordDiagnostic('sync_failed');
    // Still failing = three failures in 15 minutes AND one in the last two.
    // The retry runs every 30s, so a real problem keeps the last one fresh;
    // once the server recovers, an ordinary autosave ("Syncing...") no longer
    // brings back a warning about failures that have already stopped.
    const recent = diagnosticEvents().filter(e => e.kind === 'sync_failed' && Date.now() - e.at < 15 * 60 * 1000);
    setFailing(recent.length >= 3 && Date.now() - recent.at(-1).at < 2 * 60 * 1000);
  }, [online, syncState]);
  if (!online || !failing || syncState === 'synced') return null;
  // Name what actually failed: a refused photo is not fixed by checking the connection.
  const problem = latestSyncProblem();
  return <div role="status" className="mx-3 sm:mx-8 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-wrap gap-3 items-center justify-between"><div className="text-sm text-amber-900"><p>Sync has failed repeatedly. Your device work is retained. Save a backup and check your connection.</p><p className="mt-1 text-xs text-amber-800 break-words">{problem ? `Last error: ${problem.message}` : 'No error detail yet. Open Saved Facilities and tap Sync now to see what is waiting.'}</p></div><button type="button" onClick={onReview} className="min-h-11 text-sm font-semibold text-ocs-600">Review & back up</button></div>;
}
