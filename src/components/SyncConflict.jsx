import React, { useState } from 'react';
import { pullSurvey, collectKnownPhotos } from '../utils/cloudSync';
import { saveText } from '../utils/fileSaver';

export default function SyncConflict({ survey, onUseServer, onKeepDevice }) {
  const [remote, setRemote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action) {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <section role="alert" className="m-4 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-950">
      <h2 className="font-bold">This facility changed on another device</h2>
      <p className="text-sm mt-1">Your edits are kept here and have not overwritten the server. Tap Compare copies, then keep the copy that is right. The other one is saved in Recovery backups either way.</p>
      {remote && <div className="grid sm:grid-cols-2 gap-3 mt-3">
        {[[survey, 'This device'], [remote, 'Server']].map(([copy, title]) => (
          <div key={title} className="bg-white rounded-lg p-3 text-sm max-h-64 overflow-auto">
            <h3 className="font-bold">{title}: {copy.facility?.facilityName}</h3>
            <p>{copy.items?.length || 0} snags · {copy.generalNotes || 'No general notes'}</p>
            {(copy.items || []).map((item) => <p key={item.id} className="mt-2 border-t pt-2">
              {item.location} · {item.assetName} · P{item.priority}<br />{item.defectDescription}<br />
              Cost: {item.estimatedCost || 0} AED · Quantity: {item.quantity ?? 1} · {item.photos?.length || 0} photos
            </p>)}
          </div>
        ))}
      </div>}
      <div className="flex flex-wrap gap-2 mt-3 text-sm">
        <button disabled={busy} className="px-3 py-2 border rounded-lg bg-white" onClick={() => run(async () => {
          const copy = await pullSurvey(survey.id, collectKnownPhotos(survey));
          if (!copy) throw new Error('Server copy unavailable. Your device copy is unchanged.');
          setRemote(copy);
        })}>Compare copies</button>
        <button disabled={busy} className="px-3 py-2 border rounded-lg bg-white" onClick={() => run(() =>
          saveText(JSON.stringify(survey, null, 2), `survey-device-${survey.id}.json`, 'application/json')
        )}>Download device backup</button>
        {remote && <button disabled={busy} className="px-3 py-2 border rounded-lg bg-white" onClick={() => run(() =>
          saveText(JSON.stringify(remote, null, 2), `survey-server-${remote.id}.json`, 'application/json')
        )}>Download server copy</button>}
        {remote && onKeepDevice && <button disabled={busy} className="px-3 py-2 rounded-lg bg-ocs-600 text-white font-semibold" onClick={() => run(async () => {
          // Saves the server copy to Recovery backups, then uploads this one on
          // top of it. Snags added on the other device stay on the server.
          await onKeepDevice(survey, remote);
        })}>Keep this device's copy</button>}
        {remote && <button disabled={busy} className="px-3 py-2 border rounded-lg bg-white" onClick={() => run(async () => {
          // Keep a separate recovery record before replacing the device copy.
          // onUseServer checks the snapshot again, so intervening edits survive.
          await onUseServer(survey, remote);
        })}>Keep a recovery copy and use server</button>}
      </div>
      {error && <p className="text-sm mt-2 text-rose-700">{error}</p>}
    </section>
  );
}
