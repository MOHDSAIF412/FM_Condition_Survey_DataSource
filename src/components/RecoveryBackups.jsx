import React, { useEffect, useState } from 'react';
import { listSurveyRecoveries } from '../utils/storage';
import { saveText } from '../utils/fileSaver';

export default function RecoveryBackups({ userId, onClose }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { listSurveyRecoveries().then(setRows).catch((e) => setError(e.message)); }, []);
  return <section className="m-4 p-4 rounded-xl border bg-white" aria-label="Recovery backups">
    <div className="flex justify-between"><h2 className="font-bold">Recovery backups on this device</h2><button onClick={onClose}>Close</button></div>
    <p className="text-sm text-slate-600">Copies kept before submission, deletion or resolving a sync conflict. Download one to inspect or restore using Restore Survey. These backups are stored on this device.</p>
    {rows.filter((r) => r.survey.recoveryUserId === userId).map((r) => <button key={r.key}
      className="block text-sm text-sky-700 underline mt-3" onClick={() => saveText(JSON.stringify(r.survey, null, 2), `recovery-${r.survey.id}.json`)
        .catch((e) => setError(e.message))}>{r.survey.facility?.facilityName || r.survey.id} · {r.survey.recoveryReason || 'Recovery copy'} · {new Date(r.savedAt).toLocaleString()}</button>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
