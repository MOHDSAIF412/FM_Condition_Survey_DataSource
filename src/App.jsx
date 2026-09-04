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
import { saveSurveyOffline, loadCurrentSurveyOffline } from './utils/storage';
import { generateSurveyExcel } from './utils/excelGenerator';

export default function App() {
  const [survey, setSurvey] = useState(sampleSurveyData);
  const [activeTab, setActiveTab] = useState('facility');
  const [showReportModal, setShowReportModal] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef(null);

  // Load from IndexedDB on initial launch
  useEffect(() => {
    async function initStorage() {
      try {
        const saved = await loadCurrentSurveyOffline();
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

  // Auto-save to offline IndexedDB whenever survey changes
  useEffect(() => {
    if (!isLoaded) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveSurveyOffline(survey);
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    }, 600);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [survey, isLoaded]);

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
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(survey, null, 2));
    const downloadAnchor = document.createElement('a');
    const safeTitle = (survey.facility?.buildingName || 'survey').replace(/\s+/g, '_').toLowerCase();
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${safeTitle}_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
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
      />

      {/* Navigation (Desktop Tabs & Mobile Sticky Bottom Bar) */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        itemsCount={(survey?.items || []).length}
        urgentCount={urgentCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
        {activeTab === 'facility' && (
          <FacilityInfo
            facility={survey?.facility || {}}
            onChange={handleUpdateFacility}
            onNext={() => setActiveTab('items')}
          />
        )}

        {activeTab === 'items' && (
          <SurveyList
            items={survey?.items || []}
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            items={survey?.items || []}
            onOpenReport={() => setShowReportModal(true)}
          />
        )}

        {activeTab === 'signatures' && (
          <SignatureSection
            signatures={survey?.signatures || {}}
            onChange={handleUpdateSignatures}
            facility={survey?.facility || {}}
            onOpenReport={() => setShowReportModal(true)}
          />
        )}
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
