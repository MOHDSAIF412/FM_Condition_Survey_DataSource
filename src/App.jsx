import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import FacilityInfo from './components/FacilityInfo';
import SurveyList from './components/SurveyList';
import AnalyticsView from './components/AnalyticsView';
import SignatureSection from './components/SignatureSection';
import ReportModal from './components/ReportModal';
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
  subscribeToCloudChanges
} from './utils/cloudSync';
import { isCloudConfigured } from './utils/supabaseClient';

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
  const [survey, setSurvey] = useState(sampleSurveyData);
  const [activeTab, setActiveTab] = useState('facility');
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
  const surveyRef = useRef(null);
  const pushTimeoutRef = useRef(null);
  surveyRef.current = survey;

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
          // Store sample survey initially so the user has immediate demo data
          setSurvey(sampleSurveyData);
          await saveSurveyOffline(sampleSurveyData);
        }
      } catch (e) {
        console.warn('Storage initial load notice:', e);
        setSurvey(sampleSurveyData);
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
        setSyncState('syncing');
        const pushResult = await pushSurvey(surveyRef.current);

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

  const handleUpdateItem = (updatedItem) => {
    setSurvey((prev) => ({
      ...prev,
      items: (prev.items || []).map((i) => (i.id === updatedItem.id ? updatedItem : i))
    }));
  };

  const handleDeleteItem = (itemId) => {
    setSurvey((prev) => ({
      ...prev,
      items: (prev.items || []).filter((i) => i.id !== itemId && String(i.id) !== String(itemId))
    }));
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
      />

      {/* Navigation (Desktop Tabs & Mobile Sticky Bottom Bar) */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        itemsCount={(survey?.items || []).length}
        urgentCount={urgentCount}
      />

      {/* Main Content Area */}
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
