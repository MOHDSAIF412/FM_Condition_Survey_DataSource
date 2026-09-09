import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import FacilityInfo from './components/FacilityInfo';
import SurveyList from './components/SurveyList';
import AnalyticsView from './components/AnalyticsView';
import SignatureSection from './components/SignatureSection';
import ReportModal from './components/ReportModal';
import SavedFacilities from './components/SavedFacilities';
import ProjectDashboard from './components/ProjectDashboard';
import Breadcrumb from './components/Breadcrumb';
import { createNewSurvey, calculateSurveyStats } from './types/survey';
import {
  saveSurveyOffline,
  loadCurrentSurveyOffline,
  subscribeToSurveyChanges,
  markSurveySynced,
  deleteSurveyOffline,
  listAllSurveysOffline
} from './utils/storage';
import { generateSurveyExcel } from './utils/excelGenerator';
import { saveText } from './utils/fileSaver';
import {
  pushSurvey,
  pullSurvey,
  fetchLatestSurveyId,
  collectKnownPhotos,
  subscribeToCloudChanges,
  listSurveys,
  deleteSurveyPermanently
} from './utils/cloudSync';
import { isCloudConfigured } from './utils/supabaseClient';
import { initNetworkMonitor, onNetworkChange, isOnline } from './utils/network';
import { PHOTO_SYNC, consumeCaptureReturn } from './utils/photoCapture';
import {
  listProjects,
  createProject as createProjectRecord,
  assignFacilityToProject,
  getActiveProjectId,
  setActiveProjectId,
  cachedProjects
} from './utils/projects';

/**
 * Keeps a tab's subtree mounted and toggles visibility with CSS.
 *
 * `hidden` gives display:none, so an inactive panel costs no layout, no paint
 * and no reconciliation -- but the DOM and component state survive, so
 * switching back is a style flip rather than a full rebuild. The enter
 * animation touches only opacity and transform, which the compositor can run
 * without laying out again.
 */
function TabPanel({ active, children }) {
  return (
    <div hidden={!active} className={active ? 'tab-panel-enter' : undefined}>
      {children}
    </div>
  );
}

export default function App() {
  // A blank survey, never the demo one. Seeding sampleSurveyData meant every
  // new inspection opened with "Old Grandstand" already in the facility field.
  const [survey, setSurvey] = useState(() => createNewSurvey());
  // Opens on Facility Info, the first page of an inspection -- except when this
  // launch is the app coming back from the camera. Android can destroy the
  // Activity while the camera app is in front; on return the WebView reloads
  // and React remounts, which used to dump the surveyor back on the Facility
  // screen mid-inspection. Only that case restores the previous tab.
  const [activeTab, setActiveTab] = useState(() => {
    try {
      if (!consumeCaptureReturn()) return 'facility';
      const saved = localStorage.getItem('fm_active_tab');
      return ['facility', 'items', 'analytics', 'signatures'].includes(saved) ? saved : 'facility';
    } catch {
      return 'facility';
    }
  });

  useEffect(() => {
    try { localStorage.setItem('fm_active_tab', activeTab); } catch { /* private mode */ }
  }, [activeTab]);
  /**
   * Where in Project > Facility > Module the user is.
   *
   * A plain view state rather than a router: the app is wrapped in Capacitor
   * and has never had URL routing, so introducing history and deep links here
   * would add a whole class of problems for no gain on a device.
   *
   *   'projects'   pick or create a project
   *   'facilities' pick or create a facility inside that project
   *   'survey'     the existing five tabs, always for one chosen facility
   */
  const [view, setView] = useState('projects');
  const [projects, setProjects] = useState(() => cachedProjects());
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const activeProjectRef = useRef(null);
  activeProjectRef.current = activeProject;

  const [showReportModal, setShowReportModal] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef(null);
  // Set when adopting data that came from elsewhere (another tab or another
  // device). Each consumer gets its own flag: a single shared boolean is
  // cleared by whichever effect runs first, so the other one never sees it and
  // writes the change straight back out again.
  const skipLocalSaveRef = useRef(false);
  const skipCloudPushRef = useRef(false);
  // True from the moment the user changes anything until that change has been
  // pushed. While it is set, a pull must never replace local state -- the
  // server is by definition behind us.
  const hasUnpushedEditsRef = useRef(false);

  function markAsExternalChange() {
    skipLocalSaveRef.current = true;
    skipCloudPushRef.current = true;
  }
  const [syncState, setSyncState] = useState(isCloudConfigured ? 'idle' : 'off');
  const [online, setOnline] = useState(isOnline());
  const surveyRef = useRef(null);
  const pushTimeoutRef = useRef(null);
  surveyRef.current = survey;

  // Connectivity monitoring. A returning connection is what kicks off the
  // pending sync, so nothing has to be re-entered after working offline.
  useEffect(() => {
    initNetworkMonitor().then(() => setOnline(isOnline()));

    return onNetworkChange((nowOnline) => {
      setOnline(nowOnline);
      if (!nowOnline) {
        setSyncState('offline');
        return;
      }
      // Back online: flush whatever was recorded with no signal -- both the
      // survey on screen and any facility submitted offline, which is no
      // longer the one on screen (see flushPendingSurveys).
      if (isCloudConfigured) {
        setSyncState('syncing');
        (async () => {
          try {
            if (surveyRef.current) await pushAndSettle();
          } catch (err) {
            console.info('Reconnect sync deferred:', err.message);
            setSyncState('offline');
          }
          try {
            await flushPendingSurveys();
          } catch (err) {
            console.info('Pending upload deferred:', err.message);
          }
        })();
      }
    });
  }, []);

  /** Marks exactly the photos the server confirmed, so the badges tell the truth. */
  function applyPhotoSyncResult(result) {
    if (!result) return;
    const synced = new Set(result.syncedPhotoIds || []);
    const failed = new Set(result.failedPhotoIds || []);
    if (!synced.size && !failed.size) return;

    setSurvey((prev) => {
      const next = {
        ...prev,
        items: (prev.items || []).map((it) => ({
          ...it,
          photos: (it.photos || []).map((p) =>
            synced.has(p.id) ? { ...p, syncStatus: PHOTO_SYNC.SYNCED }
            : failed.has(p.id) ? { ...p, syncStatus: PHOTO_SYNC.FAILED }
            : p
          )
        }))
      };
      skipCloudPushRef.current = true; // status only, nothing to send back up
      return next;
    });
  }

  /**
   * Pushes the current survey and settles everything that must follow a push.
   *
   * Both callers -- the debounced autosave and the back-online handler -- have
   * to run this. They used to be written separately, and the reconnect path
   * pushed the data but skipped the bookkeeping: `hasUnpushedEditsRef` stayed
   * true (which blocks incoming realtime pulls, so the device stopped seeing
   * other devices' work), the local copy stayed flagged `pendingSync`,
   * tombstones were replayed, and `cloudRevision` went stale so the next push
   * looked like a conflict. Sharing one implementation is what keeps a
   * "worked offline, then reconnected" survey behaving like any other.
   */
  async function pushAndSettle() {
    const pushResult = await pushSurvey(surveyRef.current);
    applyPhotoSyncResult(pushResult);

    // The server was ahead of us, so the push was refused rather than
    // allowed to overwrite newer work. Take the server's copy instead.
    if (pushResult && pushResult.conflict) {
      const current = surveyRef.current;
      const remote = await pullSurvey(current.id, collectKnownPhotos(current));
      if (remote && Array.isArray(remote.items)) {
        markAsExternalChange();
        setSurvey(remote);
        await saveSurveyOffline(remote, { pendingSync: false });
      }
      setSyncState('synced');
      return pushResult;
    }

    if (pushResult && pushResult.pushed) {
      hasUnpushedEditsRef.current = false;

      // Tombstones have been applied server-side; drop them so they are not
      // replayed forever.
      const cur = surveyRef.current;
      if ((cur.deletedItemIds || []).length || (cur.deletedPhotoIds || []).length) {
        surveyRef.current = { ...cur, deletedItemIds: [], deletedPhotoIds: [] };
      }
    }

    // Remember the server revision we now sit on, so the next push can prove
    // it is building on current server state rather than guessing from a
    // local counter.
    if (pushResult && pushResult.cloudRevision !== undefined) {
      surveyRef.current = { ...surveyRef.current, cloudRevision: pushResult.cloudRevision };
      skipLocalSaveRef.current = true;
      skipCloudPushRef.current = true;
      setSurvey(surveyRef.current);
    }

    await markSurveySynced(surveyRef.current.id);
    setSyncState('synced');
    return pushResult;
  }

  /**
   * Uploads every survey still holding unsent work -- not only the one on screen.
   *
   * ROOT CAUSE of "I submitted a facility with no signal and it never appeared
   * on the laptop": submitting immediately opens a fresh blank survey, so by
   * the time the connection came back `surveyRef.current` was that empty one.
   * The reconnect handler pushed it, reported "synced", and the facility the
   * surveyor had actually submitted sat in IndexedDB marked pendingSync
   * forever. Nothing ever looked for it again, so its snags and photos never
   * reached the database and could not be downloaded anywhere else.
   *
   * Each survey is pushed independently: one that fails must not stop the rest,
   * and anything still unsent keeps its pendingSync flag so the next
   * connection retries it.
   */
  async function flushPendingSurveys() {
    if (!isCloudConfigured || !isOnline()) return { flushed: 0, failed: 0 };

    let stored = [];
    try {
      stored = await listAllSurveysOffline();
    } catch (err) {
      console.warn('[sync] could not read local surveys:', err?.message);
      return { flushed: 0, failed: 0 };
    }

    let flushed = 0;
    let failed = 0;
    const problems = [];
    for (const local of stored) {
      if (!local || !local.id || !local.pendingSync) continue;
      if (local.id === surveyRef.current?.id) continue;   // pushAndSettle owns this one
      // An untouched blank survey is not worth a round trip.
      if (!local.submittedAt && !(local.items || []).length) continue;

      const label = local.facility?.facilityName || local.facility?.buildingName || local.id;
      try {
        let res = await pushSurvey(local);

        // The server moved on while this device had no signal, so the push was
        // refused to avoid overwriting work this client never saw. Left alone
        // it stays "waiting to upload" forever -- which is exactly what a
        // surveyor reported. Re-base onto the revision the server actually
        // holds and push again: the push is an upsert with explicit tombstones,
        // so merging in this device's work cannot delete anything already there.
        if (res && res.conflict && res.reason === 'stale' && res.serverRevision !== undefined) {
          console.info(`[sync] "${label}" was behind the server; re-basing and retrying`);
          res = await pushSurvey({ ...local, cloudRevision: res.serverRevision });
        }

        if (res && res.pushed) {
          await markSurveySynced(local.id);
          flushed++;
        } else if (res && res.conflict) {
          // 'destructive': this device holds far less than the server. Refusing
          // is correct -- uploading would look like a mass deletion.
          failed++;
          problems.push(`${label}: server has more data than this device, left untouched`);
        }
      } catch (err) {
        failed++;
        problems.push(`${label}: ${err.message}`);
        console.info('[sync] still pending, will retry on the next connection:', local.id, err.message);
      }
    }

    if (flushed) {
      console.info(`[sync] uploaded ${flushed} facility(ies) recorded offline`);
    }
    if (flushed || failed) await refreshSurveyList();
    return { flushed, failed, problems };
  }

  /**
   * Pushes the facility on screen, then every other one still waiting.
   *
   * Both halves are needed. `flushPendingSurveys` deliberately skips the open
   * survey (pushAndSettle owns it), so on a launch where the open survey is
   * itself unsent -- reopening the app after submitting with no signal ---
   * nothing would upload it. Running both is what makes "open the app on
   * wifi and everything catches up" actually true.
   */
  const syncEverything = async () => {
    if (!isCloudConfigured) return { message: 'Cloud sync is not configured on this build.' };
    if (!isOnline()) return { message: 'Still offline. Your work is saved and will upload automatically.' };

    setSyncState('syncing');
    let pushedCurrent = false;
    try {
      if (surveyRef.current) {
        const res = await pushAndSettle();
        pushedCurrent = Boolean(res && res.pushed);
      }
    } catch (err) {
      console.info('Sync of the open facility deferred:', err.message);
    }

    const { flushed, failed, problems } = await flushPendingSurveys();
    await refreshSurveyList();
    setSyncState(failed ? 'offline' : 'synced');

    if (failed) return { message: `${flushed} uploaded, ${failed} could not: ${problems.join('; ')}` };
    if (flushed) return { message: `${flushed} facility(ies) uploaded.` };
    if (pushedCurrent) return { message: 'Up to date. Everything is on the server.' };
    return { message: 'Nothing waiting — everything is already uploaded.' };
  };

  /** The button in Saved Facilities. */
  const handleSyncNow = syncEverything;

  // Load from IndexedDB on initial launch
  useEffect(() => {
    async function initStorage() {
      try {
        const saved = await loadCurrentSurveyOffline();

        const localHasUnpushedWork =
          saved && saved.pendingSync && Array.isArray(saved.items) && saved.items.length > 0;

        // Work done with no signal has not reached the server yet. Pulling here
        // would overwrite it with the older server copy and lose the survey.
        if (localHasUnpushedWork) {
          setSurvey(saved);
          return;
        }

        // Otherwise prefer the server copy, so a phone and a laptop open the
        // same survey.
        if (isCloudConfigured) {
          try {
            const remoteId = (saved && saved.id) || (await fetchLatestSurveyId());
            if (remoteId) {
              const remote = await pullSurvey(remoteId, collectKnownPhotos(saved));
              // An empty array is truthy, so a server survey whose items failed
              // to upload would otherwise wipe perfectly good local data.
              const remoteHasContent = remote && Array.isArray(remote.items) && remote.items.length > 0;
              const localHasContent = saved && Array.isArray(saved.items) && saved.items.length > 0;
              if (remoteHasContent || (remote && !localHasContent)) {
                setSurvey(remote);
                await saveSurveyOffline(remote, { pendingSync: false });
                setIsLoaded(true);
                setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                return;
              }
            }
          } catch (cloudErr) {
            // Offline or unreachable: fall through to the local copy.
            console.info('Cloud unavailable at startup, using local data:', cloudErr.message);
          }
        }

        if (saved && saved.items) {
          setSurvey(saved);
        } else {
          // Nothing stored yet: start a genuinely empty inspection so the
          // surveyor must choose the facility rather than inherit a demo one.
          const fresh = createNewSurvey(1);
          setSurvey(fresh);
          await saveSurveyOffline(fresh);
        }
      } catch (e) {
        console.warn('Storage initial load notice:', e);
        setSurvey(createNewSurvey());
      } finally {
        setIsLoaded(true);
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    }
    initStorage();
  }, []);

  // Another tab in this browser saved: adopt its version instead of showing
  // stale data. (This is same-browser only - it cannot reach another device.)
  useEffect(() => {
    if (!isLoaded) return;

    const unsubscribe = subscribeToSurveyChanges(async () => {
      try {
        // Same rule as the cloud handler: a tab holding older state must not
        // roll back edits this one has made but not yet saved.
        if (hasUnpushedEditsRef.current) return;

        const latest = await loadCurrentSurveyOffline();
        if (!latest || !Array.isArray(latest.items)) return;
        if (hasUnpushedEditsRef.current) return;

        const current = surveyRef.current || {};
        const countPhotos = (s2) => (s2.items || []).reduce((n, i) => n + (i.photos || []).length, 0);
        if (latest.items.length < (current.items || []).length) return;
        if (countPhotos(latest) < countPhotos(current)) return;

        markAsExternalChange();
        setSurvey(latest);
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        console.warn('Could not sync change from another tab:', err);
      }
    });

    return unsubscribe;
  }, [isLoaded]);

  // Auto-save to offline IndexedDB whenever survey changes
  useEffect(() => {
    if (!isLoaded) return;

    // This change came from another tab, so it is already saved.
    if (skipLocalSaveRef.current) {
      skipLocalSaveRef.current = false;
      return;
    }

    hasUnpushedEditsRef.current = true;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await saveSurveyOffline(survey);

        // Refused because another tab had newer data. Take theirs rather than
        // silently destroying it.
        if (result && result.conflict) {
          markAsExternalChange();
          setSurvey(result.stored);
        }
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    }, 600);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [survey, isLoaded]);

  // Push local changes to the server so other devices see them.
  useEffect(() => {
    if (!isLoaded || !isCloudConfigured) return;
    if (skipCloudPushRef.current) {
      skipCloudPushRef.current = false;
      return; // came from elsewhere, it is already on the server
    }

    if (pushTimeoutRef.current) clearTimeout(pushTimeoutRef.current);

    pushTimeoutRef.current = setTimeout(async () => {
      try {
        if (!isOnline()) { setSyncState('offline'); return; }
        setSyncState('syncing');
        await pushAndSettle();
      } catch (err) {
        // Offline is the normal case on site, not an error worth shouting about.
        console.info('Cloud push deferred:', err.message);
        setSyncState('offline');
      }
    }, 1500);

    return () => {
      if (pushTimeoutRef.current) clearTimeout(pushTimeoutRef.current);
    };
  }, [survey, isLoaded]);

  // Another device changed this survey: pull it in.
  useEffect(() => {
    if (!isLoaded || !isCloudConfigured || !survey?.id) return;

    const unsubscribe = subscribeToCloudChanges(survey.id, async () => {
      try {
        // Our own push fires this subscription too. By the time the pull
        // returns, the user has usually typed or added something else -- and
        // the server copy does not have it yet. Adopting it here is what made a
        // second photo, or a newly added snag, appear and then vanish a
        // fraction of a second later. If we have anything unpushed, skip: our
        // pending push is the newer truth and will reconcile.
        if (hasUnpushedEditsRef.current) return;

        const current = surveyRef.current;
        const remote = await pullSurvey(current.id, collectKnownPhotos(current));
        if (!remote || !Array.isArray(remote.items)) return;

        // Re-check: the await above is a window in which the user may have
        // started editing again.
        if (hasUnpushedEditsRef.current) return;

        // Never let an empty remote replace local work that has content.
        if (remote.items.length === 0 && (current.items || []).length > 0) return;

        // Never go backwards: fewer snags or fewer photos than we hold means
        // this is a stale view of the server, not a genuine remote change.
        const countPhotos = (s2) => (s2.items || []).reduce((n, i) => n + (i.photos || []).length, 0);
        if (remote.items.length < (current.items || []).length) return;
        if (countPhotos(remote) < countPhotos(current)) return;

        // Ignore the echo of our own push.
        if (JSON.stringify(remote.items) === JSON.stringify(current.items) &&
            JSON.stringify(remote.facility) === JSON.stringify(current.facility)) {
          return;
        }

        markAsExternalChange();
        setSurvey(remote);
        await saveSurveyOffline(remote, { pendingSync: false });
        setSyncState('synced');
      } catch (err) {
        console.warn('Could not pull remote change:', err);
      }
    });

    return unsubscribe;
  }, [isLoaded, survey?.id]);

  /**
   * Finishes the current facility and starts a fresh one.
   *
   * The current survey is only marked submitted and set aside once it is
   * actually stored. If there is no connection it is kept locally as submitted
   * and pending, and uploads on reconnect - the surveyor is never blocked from
   * moving to the next facility just because there is no signal.
   */
  const handleSubmitFacility = async () => {
    const current = surveyRef.current;
    const name = current?.facility?.facilityName || current?.facility?.buildingName;

    if (!name || !String(name).trim()) {
      alert('Enter the Facility Name before submitting.');
      setActiveTab('facility');
      return;
    }
    // Checks the defect text, not the old snag-name field: that input was
    // removed from the form, so requiring it here would make every facility
    // impossible to submit.
    const hasRealSnag = (current.items || []).some(
      (i) => (i.defectDescription || '').trim() || (i.location || '').trim()
    );
    if (!hasRealSnag) {
      alert('Add at least one snag before submitting this facility.');
      setActiveTab('items');
      return;
    }
    if (!confirm(`Submit "${name}" and start a new facility?

It stays available in the facility list for reports.`)) {
      return;
    }

    const submitted = {
      ...current,
      status: 'submitted',
      submittedAt: new Date().toISOString()
    };

    // Store locally first - that is what guarantees nothing is lost offline.
    try {
      await saveSurveyOffline(submitted, { pendingSync: true });
    } catch (err) {
      console.error('Could not save the submitted facility:', err);
      alert('Could not save this facility locally. Nothing has been changed.');
      return;
    }

    if (isCloudConfigured && isOnline()) {
      try {
        setSyncState('syncing');
        await pushSurvey(submitted);
        await markSurveySynced(submitted.id);
        setSyncState('synced');
      } catch (err) {
        console.info('Submitted facility will upload when there is a connection:', err.message);
        setSyncState('offline');
      }
    }

    // Fresh blank facility, with its own new id so nothing is overwritten,
    // its own reference number so it is identifiable straight away, and the
    // open project so it cannot be recorded under the wrong one.
    const next = createNewSurvey(await nextFacilityNumber());
    next.projectId = activeProjectRef.current?.id || null;
    skipCloudPushRef.current = true;
    setSurvey(next);
    await saveSurveyOffline(next, { pendingSync: false });
    await refreshSurveyList();
    setActiveTab('signatures');
    alert(`"${name}" submitted and saved.

It is now in Saved Facilities, where you can download its PDF or Excel. A new blank facility is ready on the Facility tab.`);
  };

  const [surveyList, setSurveyList] = useState([]);

  /**
   * The facility list = what the server has, plus anything still only on this
   * device.
   *
   * Reading the server alone meant a facility submitted with no signal simply
   * did not appear anywhere after submitting, which reads as "my work
   * vanished". Local copies are merged in and flagged so the surveyor can see
   * it is saved and waiting to upload.
   */
  const refreshSurveyList = async () => {
    let remote = [];
    if (isCloudConfigured) {
      try { remote = await listSurveys(); } catch { /* offline: local only */ }
    }

    let local = [];
    try { local = await listAllSurveysOffline(); } catch { /* ignore */ }

    const merged = new Map(remote.map((s) => [s.id, { ...s, pendingSync: false }]));
    for (const l of local) {
      if (!l || !l.id) continue;
      // Blank, never-submitted scratch surveys are noise in this list.
      if (!l.submittedAt && !(l.items || []).length) continue;

      const existing = merged.get(l.id);
      if (existing) {
        // On the server already, but this device still has unsent edits.
        if (l.pendingSync) merged.set(l.id, { ...existing, pendingSync: true });
        continue;
      }
      merged.set(l.id, {
        id: l.id,
        title: l.title,
        facility: l.facility || {},
        facilityName: l.facility?.facilityName || l.facility?.buildingName || '',
        itemCount: (l.items || []).length,
        status: l.status || 'draft',
        submittedAt: l.submittedAt || null,
        updatedAt: l.updatedAt || new Date().toISOString(),
        pendingSync: !!l.pendingSync,
        localOnly: true
      });
    }

    setSurveyList(
      [...merged.values()].sort(
        (a, b) => new Date(b.submittedAt || b.updatedAt || 0) - new Date(a.submittedAt || a.updatedAt || 0)
      )
    );
  };

  // On launch, upload anything left unsent by an earlier offline session --
  // the app may well have been closed before the connection came back. This
  // covers the survey on screen too, which is the common case straight after
  // submitting with no signal.
  useEffect(() => {
    if (!isLoaded) return;
    refreshSurveyList();
    // Let the initial load settle before pushing, so this does not race the
    // startup pull that may still be adopting the server's copy.
    const t = setTimeout(() => {
      syncEverything().catch(() => { /* retried on the next connection */ });
    }, 2500);
    return () => clearTimeout(t);
  }, [isLoaded]);

  /** Opens a previously submitted facility so its report can be generated. */
  const handleOpenSurvey = async (surveyId) => {
    if (surveyId === survey?.id) return;
    try {
      setSyncState('syncing');
      const loaded = await pullSurvey(surveyId, {});
      if (loaded) {
        // A facility recorded before projects existed has no project. Adopt it
        // into the one being worked in rather than leaving it unreachable.
        const project = activeProjectRef.current;
        if (project && !loaded.projectId) {
          loaded.projectId = project.id;
          assignFacilityToProject(loaded.id, project.id).catch(() => { /* retried on next push */ });
        }
        markAsExternalChange();
        setSurvey(loaded);
        await saveSurveyOffline(loaded, { pendingSync: false });
        setView('survey');
      }
      setSyncState('synced');
    } catch (err) {
      alert('Could not open that facility: ' + err.message);
      setSyncState('offline');
    }
  };

  /**
   * Permanently deletes a saved facility (all its snags and photos) from the
   * server and this device. Every row is archived by the database first
   * (DATA_SAFETY.md), so it is recoverable from Supabase even though there is
   * no undo in the app itself.
   */
  const handleDeleteSurvey = async (surveyId, label) => {
    if (!confirm(`Permanently delete "${label}"?\n\nAll its snags and photos will be removed. This cannot be undone from the app.`)) {
      return;
    }
    try {
      setSyncState('syncing');
      if (isCloudConfigured) {
        await deleteSurveyPermanently(surveyId);
      }
      await deleteSurveyOffline(surveyId);

      // Deleted the one currently open: it no longer exists anywhere, so
      // start a fresh blank facility rather than keep editing a ghost.
      if (surveyId === survey?.id) {
        const fresh = createNewSurvey(await nextFacilityNumber());
        fresh.projectId = activeProjectRef.current?.id || null;
        skipCloudPushRef.current = true;
        setSurvey(fresh);
        await saveSurveyOffline(fresh, { pendingSync: false });
        setActiveTab('facility');
      }

      await refreshSurveyList();
      setSyncState('idle');
    } catch (err) {
      alert('Could not delete that facility: ' + err.message);
      setSyncState('offline');
    }
  };

  // Handle Tab Switch to Report
  const handleTabChange = (tabId) => {
    if (tabId === 'report') {
      setShowReportModal(true);
    } else {
      setActiveTab(tabId);
    }
  };

  // Reset / Clear
  const handleReset = async () => {
    if (confirm('Start a fresh blank condition survey?')) {
      const fresh = createNewSurvey(await nextFacilityNumber());
      fresh.projectId = activeProjectRef.current?.id || null;
      setSurvey(fresh);
      await saveSurveyOffline(fresh);
      setActiveTab('facility');
    }
  };

  /* ------------------------------------------------------- projects ----- */

  /**
   * Loads the project list and restores the one last worked in.
   *
   * The list is cached, so with no signal the picker still shows the projects
   * this device has seen rather than an empty screen.
   */
  const refreshProjects = async () => {
    setProjectsLoading(true);
    try {
      const list = await listProjects();
      setProjects(list);
      return list;
    } catch (err) {
      console.warn('[projects] could not load:', err.message);
      return cachedProjects();
    } finally {
      setProjectsLoading(false);
    }
  };

  /** True when the survey already open belongs to this project. */
  function loadedFacilityBelongsTo(project) {
    const current = surveyRef.current;
    if (!current || !project) return false;
    return current.projectId === project.id;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await refreshProjects();
      if (cancelled) return;

      // Drop straight back into the project last used, so reopening the app
      // mid-survey does not mean walking the hierarchy again.
      const savedId = getActiveProjectId();
      const restored = savedId ? list.find((p) => p.id === savedId) : null;
      if (restored) {
        setActiveProject(restored);
        setView(loadedFacilityBelongsTo(restored) ? 'survey' : 'facilities');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const handleOpenProject = (project) => {
    setActiveProject(project);
    setActiveProjectId(project.id);
    setView('facilities');
    refreshSurveyList();
  };

  const handleBackToProjects = () => {
    setView('projects');
    refreshProjects();
  };

  const handleCreateProject = async (details) => {
    const created = await createProjectRecord(details);
    setProjects((prev) => [{ ...created, facilityCount: 0 }, ...prev]);
    handleOpenProject(created);
    return created;
  };

  /** Starts a facility inside the open project and goes to its details. */
  const handleAddFacilityToProject = async () => {
    const project = activeProjectRef.current;
    if (!project) {
      alert('Please select a project first.');
      setView('projects');
      return;
    }

    const current = surveyRef.current;
    const currentIsBlankInThisProject =
      current && current.projectId === project.id &&
      !(current.facility?.facilityName || current.facility?.buildingName) &&
      !(current.items || []).some((i) => (i.defectDescription || '').trim() || (i.location || '').trim());

    // Reuse an untouched blank facility instead of stacking up empty ones.
    if (!currentIsBlankInThisProject) {
      const fresh = createNewSurvey(await nextFacilityNumber());
      fresh.projectId = project.id;
      skipCloudPushRef.current = true;  // nothing worth a server row until it has content
      setSurvey(fresh);
      await saveSurveyOffline(fresh, { pendingSync: false });
    }

    setActiveTab('facility');
    setView('survey');
  };

  /** Facilities belonging to the open project, and nothing else. */
  const facilitiesInProject = activeProject
    ? surveyList.filter((s) => s.projectId === activeProject.id)
    : [];

  /**
   * The next facility number, continuing from every facility this device knows
   * about -- the ones on screen in the list and the ones stored locally.
   *
   * Falls back to counting facilities when older records carry no number, so a
   * survey started before numbering existed does not force the count back to 1.
   */
  async function nextFacilityNumber() {
    // Keyed by survey id: the same facility appears in both the server list and
    // local storage, and counting it twice made the sequence skip (1, 3, 5...).
    const byId = new Map();

    for (const s of surveyList) {
      if (s && s.id) byId.set(s.id, s.facility || {});
    }
    try {
      for (const s of await listAllSurveysOffline()) {
        if (s && s.id && !byId.has(s.id)) byId.set(s.id, s.facility || {});
      }
    } catch { /* local read failed; the list alone still gives a sensible number */ }

    let highest = 0;
    for (const facility of byId.values()) {
      const n = Number(facility?.facilityNumber);
      if (n && !Number.isNaN(n) && n > highest) highest = n;
    }

    // `byId.size` keeps numbering sensible for records made before numbering
    // existed, which carry no number at all.
    return Math.max(highest, byId.size) + 1;
  }

  /**
   * Begins a new facility from the Facility tab, keeping the current one.
   *
   * Distinct from "Submit & Start New Facility": that one marks the facility
   * finished. This is for starting the next site without declaring the
   * previous one complete -- the surveyor's own words: "give me the option to
   * create a new facility and continue with that". Every snag added afterwards
   * belongs to the new facility, because it carries a brand new id.
   */
  const handleNewFacility = async () => {
    const current = surveyRef.current;
    const currentName = current?.facility?.facilityName || current?.facility?.buildingName;
    const currentHasWork = Boolean(currentName) || (current?.items || []).some(
      (i) => (i.defectDescription || '').trim() || (i.location || '').trim() || (i.photos || []).length
    );

    // Already sitting on an untouched blank one -- nothing to do but say so.
    if (!currentHasWork) {
      alert('This is already a new, empty facility. Enter its name below to begin.');
      setActiveTab('facility');
      return;
    }

    const keptAs = currentName || 'The current facility';
    if (!confirm(`Start a new facility?\n\n${keptAs} stays saved and is listed under Saved Facilities on the Sign-Off tab. Snags you add from now on go to the new facility.`)) {
      return;
    }

    // Make sure the one being left behind is written down before switching.
    try {
      await saveSurveyOffline(current, { pendingSync: true });
    } catch (err) {
      console.error('Could not save the current facility before switching:', err);
      alert('Could not save the current facility, so nothing has been changed.');
      return;
    }

    const fresh = createNewSurvey(await nextFacilityNumber());
    fresh.projectId = activeProjectRef.current?.id || null;
    skipCloudPushRef.current = true;   // an empty facility is not worth a server row yet
    setSurvey(fresh);
    await saveSurveyOffline(fresh, { pendingSync: false });
    await refreshSurveyList();
    setActiveTab('facility');
  };

  // Backup export as JSON
  const handleExportJSON = async () => {
    const safeTitle = (survey.facility?.buildingName || 'survey').replace(/\s+/g, '_').toLowerCase();
    const filename = `${safeTitle}_backup_${new Date().toISOString().split('T')[0]}.json`;
    try {
      await saveText(JSON.stringify(survey, null, 2), filename, 'application/json', 'Survey backup');
    } catch (err) {
      console.error('Backup export failed:', err);
      alert('Could not save the backup file: ' + err.message);
    }
  };

  // Restore import from JSON
  const handleImportJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (parsed && (parsed.facility || parsed.items)) {
          setSurvey(parsed);
          await saveSurveyOffline(parsed);
          alert('Survey restored successfully!');
        } else {
          alert('Invalid survey backup file format.');
        }
      } catch (err) {
        alert('Failed to parse JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  // Item modifications
  const handleAddItem = (newItem) => {
    setSurvey((prev) => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
  };

  const handleUpdateItem = (updatedItem, options = {}) => {
    setSurvey((prev) => {
      // A removed photo is tombstoned so the deletion reaches other devices;
      // the marker itself is stripped before storing.
      const { _deletedPhotoId, ...cleanItem } = updatedItem;
      const next = {
        ...prev,
        items: (prev.items || []).map((i) => (i.id === cleanItem.id ? cleanItem : i)),
        deletedPhotoIds: _deletedPhotoId
          ? [...new Set([...(prev.deletedPhotoIds || []), _deletedPhotoId])]
          : prev.deletedPhotoIds
      };

      // A photo cannot wait for the 600ms autosave debounce. The camera can get
      // the app killed by Android, and anything not yet written is simply gone.
      // Write straight through before the process has a chance to die.
      if (options.persistNow) {
        saveSurveyOffline(next).catch((err) =>
          console.error('Immediate save failed after photo capture:', err)
        );
      }
      return next;
    });
  };

  const handleDeleteItem = (itemId) => {
    setSurvey((prev) => {
      const removed = (prev.items || []).find((i) => String(i.id) === String(itemId));
      const photoIds = removed ? (removed.photos || []).map((p) => p.id) : [];
      return {
        ...prev,
        items: (prev.items || []).filter((i) => String(i.id) !== String(itemId)),
        // Tombstones. The push no longer wipes the server's item list, so a
        // deletion has to be stated explicitly to travel to other devices.
        deletedItemIds: [...new Set([...(prev.deletedItemIds || []), String(itemId)])],
        deletedPhotoIds: [...new Set([...(prev.deletedPhotoIds || []), ...photoIds])]
      };
    });
  };

  const handleUpdateFacility = (facilityData) => {
    setSurvey((prev) => ({
      ...prev,
      facility: facilityData
    }));
  };

  const handleUpdateSignatures = (sigData) => {
    setSurvey((prev) => ({
      ...prev,
      signatures: sigData
    }));
  };

  // Photos still only on this device - what "waiting to sync" actually means.
  const pendingPhotoCount = (survey?.items || []).reduce(
    (n, it) => n + (it.photos || []).filter((p) => p.syncStatus && p.syncStatus !== PHOTO_SYNC.SYNCED).length,
    0
  );

  const stats = calculateSurveyStats(survey?.items || []);
  const urgentCount = stats?.priorityCounts?.[1] || 0;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        survey={survey || {}}
        onReset={handleReset}
        onOpenReport={() => setShowReportModal(true)}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportJSON}
        onExportExcel={() => generateSurveyExcel(survey || {})}
        lastSaved={lastSavedTime}
        syncState={syncState}
        online={online}
        pendingCount={pendingPhotoCount}
      />

      {/* Navigation belongs to a chosen facility: the five tabs all act on one
          survey, so showing them before a facility is picked would offer
          modules with nothing behind them. */}
      {view === 'survey' && (
        <Navigation
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          itemsCount={(survey?.items || []).length}
          urgentCount={urgentCount}
        />
      )}

      {/* Project picker: nothing project-specific is reachable until one is chosen. */}
      {view === 'projects' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
          <ProjectDashboard
            projects={projects}
            loading={projectsLoading}
            online={online}
            onOpenProject={handleOpenProject}
            onCreateProject={handleCreateProject}
            onRefresh={refreshProjects}
          />
        </main>
      )}

      {/* Facilities inside the chosen project. */}
      {view === 'facilities' && activeProject && (
        <>
          <div className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2">
              <Breadcrumb
                project={activeProject}
                onHome={handleBackToProjects}
                onProject={() => setView('facilities')}
              />
            </div>
          </div>

          <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-gradient-to-r from-ocs-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-sky-400/20 text-sky-200 text-[11px] font-bold border border-sky-400/30">
                        {activeProject.projectNumber}
                      </span>
                      <h2 className="text-xl font-bold truncate">{activeProject.name}</h2>
                    </div>
                    <p className="text-sky-200/80 text-xs mt-1">
                      {facilitiesInProject.length}
                      {facilitiesInProject.length === 1 ? ' facility' : ' facilities'} in this project
                      {activeProject.client ? ` · ${activeProject.client}` : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddFacilityToProject}
                    className="px-4 py-2.5 rounded-xl bg-flame-500 hover:bg-flame-600 active:scale-[0.98] text-white font-bold text-sm shadow-card inline-flex items-center gap-2 shrink-0 transition-[background-color,transform] duration-150"
                  >
                    + Add Facility
                  </button>
                </div>
              </div>

              {!facilitiesInProject.length && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
                  <h3 className="font-bold text-slate-700 text-sm">No facilities in this project yet</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Use <span className="font-semibold">+ Add Facility</span> to start the first one.
                  </p>
                </div>
              )}

              <SavedFacilities
                surveys={facilitiesInProject}
                currentId={survey?.id}
                onOpen={handleOpenSurvey}
                onDelete={handleDeleteSurvey}
                onRefresh={refreshSurveyList}
                onSyncNow={handleSyncNow}
              />
            </div>
          </main>
        </>
      )}

      {/* Main Content Area */}
      {/* Facility bar: which facility is open, switch to another, and submit
          this one when it is finished. */}
      {view === 'survey' && (
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto sm:flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
              Facility
            </span>
            <span className="text-sm font-bold text-slate-900 truncate">
              {survey?.facility?.facilityName || survey?.facility?.buildingName || 'New facility'}
            </span>
            {survey?.status === 'submitted' && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                Submitted
              </span>
            )}
          </div>

          {surveyList.length > 0 && (
            <select
              value={survey?.id || ''}
              onChange={(e) => handleOpenSurvey(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-white max-w-[240px] min-w-0 flex-1 sm:flex-none"
              title="Open another facility to view or report on it"
            >
              {!surveyList.some((s2) => s2.id === survey?.id) && (
                <option value={survey?.id || ''}>
                  {survey?.facility?.facilityName || 'Current (unsaved)'}
                </option>
              )}
              {surveyList.map((s2) => (
                <option key={s2.id} value={s2.id}>
                  {[s2.facility?.facilityCode, s2.facilityName].filter(Boolean).join(' · ')
                    || `Unnamed facility (${s2.itemCount || 0} snag${s2.itemCount === 1 ? '' : 's'})`}
                  {s2.status === 'submitted' ? '  ✓' : '  (draft)'}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleSubmitFacility}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-xs shadow-card transition-[background-color,transform] duration-150 shrink-0"
            title="Save this facility and start a new one"
          >
            <span className="sm:hidden">Submit &amp; New</span>
            <span className="hidden sm:inline">Submit &amp; Start New Facility</span>
          </button>
        </div>

        {activeProject && (
          <div className="max-w-6xl mx-auto px-3 sm:px-6 pb-2">
            <Breadcrumb
              project={activeProject}
              facility={survey?.facility}
              moduleName={
                activeTab === 'facility' ? 'Facility Info'
                : activeTab === 'items' ? 'Survey'
                : activeTab === 'analytics' ? 'Score & CapEx'
                : activeTab === 'signatures' ? 'Sign-Off' : null
              }
              onHome={handleBackToProjects}
              onProject={() => setView('facilities')}
            />
          </div>
        )}
      </div>
      )}

      {/* Tab panels stay MOUNTED and are hidden with CSS rather than unmounted.
          Conditional rendering meant every tab tap tore down and rebuilt the
          whole subtree -- measured at 1,608 DOM nodes for 8 assets, and ~9,300
          at 50 assets, which is what made switching feel slow. Keeping them
          mounted makes a switch a style change instead of a rebuild, and it
          also preserves each tab's scroll position and in-progress input. */}
      {view === 'survey' && (
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
        <TabPanel active={activeTab === 'facility'}>
          <FacilityInfo
            facility={survey?.facility || {}}
            onChange={handleUpdateFacility}
            onNext={() => setActiveTab('items')}
            onNewFacility={handleNewFacility}
          />
        </TabPanel>

        <TabPanel active={activeTab === 'items'}>
          <SurveyList
            items={survey?.items || []}
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
          />
        </TabPanel>

        <TabPanel active={activeTab === 'analytics'}>
          <AnalyticsView
            items={survey?.items || []}
            onOpenReport={() => setShowReportModal(true)}
          />
        </TabPanel>

        <TabPanel active={activeTab === 'signatures'}>
          <div className="max-w-4xl mx-auto mb-6">
            <SavedFacilities
              surveys={surveyList}
              currentId={survey?.id}
              onOpen={handleOpenSurvey}
              onDelete={handleDeleteSurvey}
              onRefresh={refreshSurveyList}
              onSyncNow={handleSyncNow}
            />
          </div>
          <SignatureSection
            signatures={survey?.signatures || {}}
            onChange={handleUpdateSignatures}
            facility={survey?.facility || {}}
            onOpenReport={() => setShowReportModal(true)}
          />
        </TabPanel>
      </main>
      )}

      {/* Audit Report Modal & PDF Generation Engine */}
      {showReportModal && (
        <ReportModal
          survey={survey || {}}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
