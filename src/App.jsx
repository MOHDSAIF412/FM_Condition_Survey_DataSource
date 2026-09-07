import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import FacilityInfo from './components/FacilityInfo';
import SurveyList from './components/SurveyList';
import AnalyticsView from './components/AnalyticsView';
import SignatureSection from './components/SignatureSection';
import ReportModal from './components/ReportModal';
import SavedFacilities from './components/SavedFacilities';
import { sampleSurveyData } from './data/sampleSurvey';
import { createNewSurvey, calculateSurveyStats } from './types/survey';
import {
  saveSurveyOffline,
  loadCurrentSurveyOffline,
  subscribeToSurveyChanges,
  markSurveySynced
} from './utils/storage';
import { generateSurveyExcel } from './utils/excelGenerator';
import { saveText } from './utils/fileSaver';
import {
  pushSurvey,
  pullSurvey,
  fetchLatestSurveyId,
  collectKnownPhotos,
  subscribeToCloudChanges,
  listSurveys
} from './utils/cloudSync';
import { isCloudConfigured } from './utils/supabaseClient';
import { initNetworkMonitor, onNetworkChange, isOnline } from './utils/network';
import { PHOTO_SYNC } from './utils/photoCapture';

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
  // Restored from localStorage, not defaulted. Android can destroy this
  // Activity while the camera app is in front; on return the WebView reloads
  // and React remounts, which used to dump the surveyor back on the Facility
  // screen mid-inspection.
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem('fm_active_tab');
      return ['facility', 'items', 'analytics', 'signatures'].includes(saved) ? saved : 'facility';
    } catch {
      return 'facility';
    }
  });

  useEffect(() => {
    try { localStorage.setItem('fm_active_tab', activeTab); } catch { /* private mode */ }
  }, [activeTab]);
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
      // Back online: flush whatever is waiting.
      if (isCloudConfigured && surveyRef.current) {
        setSyncState('syncing');
        pushSurvey(surveyRef.current)
          .then((res) => {
            if (res && res.pushed) {
              applyPhotoSyncResult(res);
              setSyncState('synced');
            } else {
              setSyncState('idle');
            }
          })
          .catch((err) => {
            console.info('Reconnect sync deferred:', err.message);
            setSyncState('offline');
          });
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
          const fresh = createNewSurvey();
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
        const latest = await loadCurrentSurveyOffline();
        if (latest && latest.items) {
          markAsExternalChange();
          setSurvey(latest);
          setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
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
          return;
        }

        // Remember the server revision we now sit on, so the next push can
        // prove it is building on current server state rather than guessing
        // from a local counter.
        // Tombstones have been applied server-side; drop them so they are not
        // replayed forever.
        if (pushResult && pushResult.pushed) {
          const cur = surveyRef.current;
          if ((cur.deletedItemIds || []).length || (cur.deletedPhotoIds || []).length) {
            surveyRef.current = { ...cur, deletedItemIds: [], deletedPhotoIds: [] };
          }
        }
        if (pushResult && pushResult.cloudRevision !== undefined) {
          surveyRef.current = { ...surveyRef.current, cloudRevision: pushResult.cloudRevision };
          skipLocalSaveRef.current = true;
          skipCloudPushRef.current = true;
          setSurvey(surveyRef.current);
        }
        await markSurveySynced(surveyRef.current.id);
        setSyncState('synced');
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
        const current = surveyRef.current;
        const remote = await pullSurvey(current.id, collectKnownPhotos(current));
        if (!remote || !Array.isArray(remote.items)) return;

        // Never let an empty remote replace local work that has content.
        if (remote.items.length === 0 && (current.items || []).length > 0) return;

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
    if (!(current.items || []).some((i) => (i.assetName || '').trim())) {
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

    // Fresh blank facility, with its own new id so nothing is overwritten.
    const next = createNewSurvey();
    skipCloudPushRef.current = true;
    setSurvey(next);
    await saveSurveyOffline(next, { pendingSync: false });
    await refreshSurveyList();
    setActiveTab('signatures');
    alert(`"${name}" submitted and saved.

It is now in Saved Facilities, where you can download its PDF or Excel. A new blank facility is ready on the Facility tab.`);
  };

  const [surveyList, setSurveyList] = useState([]);

  const refreshSurveyList = async () => {
    if (!isCloudConfigured) return;
    try { setSurveyList(await listSurveys()); } catch { /* offline */ }
  };

  useEffect(() => { if (isLoaded) refreshSurveyList(); }, [isLoaded]);

  /** Opens a previously submitted facility so its report can be generated. */
  const handleOpenSurvey = async (surveyId) => {
    if (surveyId === survey?.id) return;
    try {
      setSyncState('syncing');
      const loaded = await pullSurvey(surveyId, {});
      if (loaded) {
        markAsExternalChange();
        setSurvey(loaded);
        await saveSurveyOffline(loaded, { pendingSync: false });
      }
      setSyncState('synced');
    } catch (err) {
      alert('Could not open that facility: ' + err.message);
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

  // Sample Data Loader
  const handleLoadSample = async () => {
    if (confirm('Load sample Commercial Tower condition survey? Current unsaved changes will be overwritten.')) {
      setSurvey(sampleSurveyData);
      await saveSurveyOffline(sampleSurveyData);
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
  };

  // Reset / Clear
  const handleReset = async () => {
    if (confirm('Start a fresh blank condition survey?')) {
      const fresh = createNewSurvey();
      setSurvey(fresh);
      await saveSurveyOffline(fresh);
      setActiveTab('facility');
    }
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
        onLoadSample={handleLoadSample}
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

      {/* Navigation (Desktop Tabs & Mobile Sticky Bottom Bar) */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        itemsCount={(survey?.items || []).length}
        urgentCount={urgentCount}
      />

      {/* Main Content Area */}
      {/* Facility bar: which facility is open, switch to another, and submit
          this one when it is finished. */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
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
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-white max-w-[240px]"
              title="Open another facility to view or report on it"
            >
              {!surveyList.some((s2) => s2.id === survey?.id) && (
                <option value={survey?.id || ''}>
                  {survey?.facility?.facilityName || 'Current (unsaved)'}
                </option>
              )}
              {surveyList.map((s2) => (
                <option key={s2.id} value={s2.id}>
                  {s2.facilityName}{s2.status === 'submitted' ? '  ✓' : '  (draft)'}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleSubmitFacility}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-xs shadow-card transition-[background-color,transform] duration-150"
            title="Save this facility and start a new one"
          >
            Submit &amp; Start New Facility
          </button>
        </div>
      </div>

      {/* Tab panels stay MOUNTED and are hidden with CSS rather than unmounted.
          Conditional rendering meant every tab tap tore down and rebuilt the
          whole subtree -- measured at 1,608 DOM nodes for 8 assets, and ~9,300
          at 50 assets, which is what made switching feel slow. Keeping them
          mounted makes a switch a style change instead of a rebuild, and it
          also preserves each tab's scroll position and in-progress input. */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
        <TabPanel active={activeTab === 'facility'}>
          <FacilityInfo
            facility={survey?.facility || {}}
            onChange={handleUpdateFacility}
            onNext={() => setActiveTab('items')}
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
              onRefresh={refreshSurveyList}
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
