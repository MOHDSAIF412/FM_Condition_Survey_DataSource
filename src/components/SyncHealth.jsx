import React, { useEffect, useState } from 'react';
import { diagnosticEvents, latestSyncProblem, recordDiagnostic } from '../utils/diagnostics';
export default function SyncHealth({ online, syncState, onReview }) {
  const [failures, setFailures] = useState(0);
  useEffect(() => {
    if (online && ['offline','error'].includes(syncState)) recordDiagnostic('sync_failed');
    setFailures(diagnosticEvents().filter(e => e.kind === 'sync_failed' && Date.now() - e.at < 15 * 60 * 1000).length);
  }, [online, syncState]);
  if (!online || failures < 3 || syncState === 'synced') return null;
  // Name what actually failed: a refused photo is not fixed by checking the connection.
  const problem = latestSyncProblem();
  return <div role="status" className="mx-3 sm:mx-8 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-wrap gap-3 items-center justify-between"><div className="text-sm text-amber-900"><p>Sync has failed repeatedly. Your device work is retained. Save a backup and check your connection.</p>{problem && <p className="mt-1 text-xs text-amber-800 break-words">Last error: {problem.message}</p>}</div><button type="button" onClick={onReview} className="min-h-11 text-sm font-semibold text-ocs-600">Review & back up</button></div>;
}
