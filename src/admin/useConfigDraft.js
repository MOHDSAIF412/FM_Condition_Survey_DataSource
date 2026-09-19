import { useEffect, useMemo, useState } from 'react';
import { listVersions, saveDraft, discardDraft, publishDraft, rollbackTo } from '../config/configStore';

const clone = (x) => JSON.parse(JSON.stringify(x));

/**
 * Draft / publish / discard / rollback for one configuration kind, as used by
 * the admin pages. The page edits `working`; nothing reaches anyone until
 * `publish`. `defaults` is the built-in configuration used before anything
 * was published; `describe(before, after)` lists changes in plain words.
 */
export function useConfigDraft(kind, { defaults, normalise, describe, onPublished }) {
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState([]);
  const [working, setWorking] = useState(null);
  const [savedJson, setSavedJson] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const published = versions.find((v) => v.status === 'published') || null;
  const draft = versions.find((v) => v.status === 'draft') || null;
  const dirty = !!working && JSON.stringify(working) !== savedJson;
  const baseline = published?.config || defaults();
  const changes = useMemo(() => (working ? describe(baseline, working) : []), [baseline, working, describe]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listVersions(kind);
      setVersions(list);
      const d = list.find((v) => v.status === 'draft');
      const p = list.find((v) => v.status === 'published');
      const start = normalise(clone((d || p)?.config || defaults()));
      setWorking(start);
      setSavedJson(d ? JSON.stringify(start) : JSON.stringify(normalise(clone(p?.config || defaults()))));
    } catch (err) {
      setError(err.message || 'Could not load.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [kind]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (fn) => setWorking((prev) => { const next = clone(prev); fn(next); return next; });

  const run = async (what, fn) => {
    setBusy(what);
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError(err.message || `Could not ${what}.`);
      return null;
    } finally {
      setBusy('');
    }
  };

  const save = () => run('save', async () => {
    setNotice('');
    const saved = await saveDraft(kind, working, {
      draftId: draft?.id, basedOn: published?.id || null, expectedUpdatedAt: draft?.updatedAt || null
    });
    setVersions((prev) => [saved, ...prev.filter((v) => v.id !== saved.id)]);
    setWorking(saved.config);
    setSavedJson(JSON.stringify(saved.config));
    setNotice(`Draft v${saved.version} saved. Nothing changes for anyone until you publish.`);
    return saved;
  });

  const publish = (notes) => run('publish', async () => {
    let d = draft;
    if (dirty || !d) {
      const saved = await saveDraft(kind, working, {
        draftId: draft?.id, basedOn: published?.id || null, expectedUpdatedAt: draft?.updatedAt || null
      });
      d = saved;
    }
    const live = await publishDraft(d, notes);
    await load();
    setNotice(`Version ${live.version} is live. The web portal uses it now; phones pick it up the next time they are online.`);
    onPublished?.();
    return live;
  });

  const discard = () => {
    if (!confirm(draft ? `Discard draft v${draft.version}? The live version is not affected.` : 'Throw away your unsaved changes?')) return null;
    return run('discard', async () => {
      if (draft) await discardDraft(draft.id);
      await load();
      setNotice('Draft discarded. You are looking at the live version again.');
      return true;
    });
  };

  const rollback = (version) => {
    if (dirty || draft) {
      alert('Save and publish, or discard, the current draft before rolling back.');
      return null;
    }
    const lines = describe(baseline, version.config);
    if (!confirm(`Roll back to version ${version.version}?\n\n${lines.map((l) => `• ${l}`).join('\n') || '• No differences from the live version'}`)) return null;
    return run('rollback', async () => {
      const live = await rollbackTo(version);
      await load();
      setNotice(`Rolled back: version ${live.version} (a copy of version ${version.version}) is live.`);
      onPublished?.();
      return live;
    });
  };

  return {
    loading, versions, working, published, draft, dirty, baseline, changes, busy, error, notice,
    update, save, publish, discard, rollback,
    nextVersion: draft ? draft.version : Math.max(0, ...versions.map((v) => v.version)) + 1
  };
}
