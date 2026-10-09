import { SubmissionValidation, focusSubmissionField } from './components/SubmissionValidation';
import WorkflowBanner from './components/WorkflowBanner';
import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import Header from './components/Header';
import SyncConflict from './components/SyncConflict';
import RecoveryBackups from './components/RecoveryBackups';
import { contentKey, settleUpload } from './utils/syncSettlement';
import Navigation from './components/Navigation';
import FacilityInfo from './components/FacilityInfo';
import SurveyList from './components/SurveyList';
import AnalyticsView from './components/AnalyticsView';
import SignatureSection from './components/SignatureSection';
const ReportModal = lazy(() => import('./components/ReportModal'));
import SavedFacilities from './components/SavedFacilities';
import ProjectDashboard from './components/ProjectDashboard';
import ModulePicker from './components/ModulePicker';
import { allowOtaAtSafeScreen } from './utils/otaUpdates';
const UserManagement = lazy(() => import('./components/UserManagement'));
import ChangePasswordModal from './components/ChangePasswordModal';
import Breadcrumb from './components/Breadcrumb';
import ProjectHero from './components/ProjectHero';
import ProjectTeam from './components/ProjectTeam';
import PhotoGallery from './components/PhotoGallery';
const ReportDashboard = lazy(() => import('./components/ReportDashboard'));
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'));
import PortalSidebar from './portal/PortalSidebar';
import WorkspaceBottomNav from './components/WorkspaceBottomNav';
import { useScreenScroll } from './utils/useScreenScroll';
import BackButton from './components/BackButton';
import { backTarget, installAndroidBackHandler } from './utils/backNavigation';
import { App as NativeApp } from '@capacitor/app';
import { isLegacyQhse, moveLegacyQhse } from './qhse/legacy';
import { createQhse, isQhse } from './qhse/model';
import { changeInspectionState, isDeletedInspection } from './qhse/lifecycle';
const QhseHub = lazy(() => import('./qhse/QhseInspection').then(m => ({ default: m.QhseHub })));
const QhseInspection = lazy(() => import('./qhse/QhseInspection'));
import PortalHome from './portal/PortalHome';
import AllFacilities from './portal/AllFacilities';
import ReviewApproval from './portal/ReviewApproval';
import {
  withDueDates, stageOf, isLocked, workflowActions, moveFacility, ACTION_LABELS, STAGE_BY_KEY, isLockedRefusal,
  workflowBackendReady
} from './utils/workflow';
import { facilityListFilter } from './portal/portalData';
import GlobalSearch from './portal/GlobalSearch';
import { Capacitor } from '@capacitor/core';
import { listTemplates, cachedTemplates, applyTemplateToItems, isBlankSnag } from './utils/templates';
import { useFormsConfig } from './config/FormsConfigContext';
import { submissionIssues } from './config/rulesEngine';
import { createNewSurvey, calculateSurveyStats, facilityCode } from './types/survey';
import {
  saveSurveyOffline,
  saveSurveyRecovery,
  loadCurrentSurveyOffline,
  subscribeToSurveyChanges,
  markSurveySynced,
  deleteSurveyOffline,
  listAllSurveysOffline,
  getSurveyOffline
} from './utils/storage';
import { generateSurveyExcel } from './utils/reportExports';
import { saveText } from './utils/fileSaver';
import {
  pushSurvey,
  pullSurvey,
  fetchLatestSurveyId,
  collectKnownPhotos,
  subscribeToCloudChanges,
  listSurveys,
  deleteSurveyPermanently,
  withTimeout,
  cachedSurveyList,
  surveyExistsOnServer,
  hydratePhotos
} from './utils/cloudSync';

// How long a surveyor is kept waiting on the server before the app gets on
// with what it already has on the device.
const OPEN_WAIT_MS = 6000;
const LIST_WAIT_MS = 8000;
const SIGN_OUT_UPLOAD_WAIT_MS = 6000;
import { isCloudConfigured } from './utils/supabaseClient';
import { can } from './utils/auth';
import { isAdminUser } from './utils/roles';
import { isAuthFailure, isAccessRefused } from './utils/syncErrors';
import { chooseSurveyToOpen, mergeSurveyLists } from './utils/surveySelection';
import { uploadSurveyRecord as uploadRecord } from './utils/uploadRecord';
import { confirmReportReady } from './utils/reportCompleteness';
import { initNetworkMonitor, onNetworkChange, isOnline } from './utils/network';
import { PHOTO_SYNC, consumeCaptureReturn } from './utils/photoCapture';
import {
  listProjects,
  listVisibleProjectIds,
  createProject as createProjectRecord,
  assignFacilityToProject,
  getActiveProjectId,
  setActiveProjectId,
  cachedProjects,
  setProjectDeleted
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

export default function App({ currentUser = null, onSignOut } = {}) {
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
  // Both platforms start by choosing the work module.
  const [view, setView] = useState('modules');
  const [workModule, setWorkModule] = useState('condition');
  const [navOpen, setNavOpen] = useState(false);
  const [createProjectSignal, setCreateProjectSignal] = useState(0);
  // Builders are available on both platforms to the same permitted roles.
  const isWebPortal = !Capacitor.isNativePlatform();
  const [adminModule, setAdminModule] = useState('forms');
  const openAdmin = (module) => { setAdminModule(module); setView('admin'); };
  const [projects, setProjects] = useState(() => cachedProjects());
  const [deletedProjects, setDeletedProjects] = useState(() => cachedProjects({ includeDeleted: true }).filter(p => p.deletedAt));
  const [projectsLoading, setProjectsLoading] = useState(false);
  // Fields, sections and rules published from the Admin Dashboard.
  const { config: formsConfig, version: formsVersion, platform, refresh: refreshFormsConfig } = useFormsConfig();
  const formsConfigRef = useRef(formsConfig);
  formsConfigRef.current = formsConfig;

  /**
   * Required fields (including ones a rule makes required) are enforced here,
   * at submit -- never while saving -- so unfinished or offline work is always
   * kept. Returns true when submission must stop.
   */
  const [validationSurveyId, setValidationSurveyId] = useState(null);
  const validationIssues = validationSurveyId === survey?.id ? submissionIssues(formsConfig, survey, platform) : [];
  function showValidationIssue(issue) {
    setView('survey');
    setActiveTab(issue.scope === 'facility' ? 'facility' : 'items');
    focusSubmissionField(issue);
  }
  function blockedByRequiredFields(record) {
    const issues = submissionIssues(formsConfigRef.current, record, platform);
    if (!issues.length) return false;
    setValidationSurveyId(record.id);
    if (record.id === surveyRef.current?.id) showValidationIssue(issues[0]);
    else handleOpenSurvey(record.id).then(() => showValidationIssue(issues[0]));
    return true;
  }
  // Inspection templates, cached so a surveyor with no signal can still start from one.
  const [templates, setTemplates] = useState(() => cachedTemplates());
  const [activeProject, setActiveProject] = useState(null);
  const activeProjectRef = useRef(null);
  activeProjectRef.current = activeProject;


  const [showReportModal, setShowReportModal] = useState(false);
  const [conflictId, setConflictId] = useState(null);
  const [showRecoveries, setShowRecoveries] = useState(false);
  const uploadInFlight = useRef(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef(null);
  // The survey waiting on the autosave timer, so it can still be written if
  // the surveyor switches facility before the timer fires.
  const pendingSaveRef = useRef(null);
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
  const localSavesInFlight = useRef(0);
  const localSaveFailed = useRef(false);
  useEffect(() => allowOtaAtSafeScreen(() =>
    isLoaded && view === 'modules' && !navOpen && !showPasswordModal
    && !showReportModal && !showRecoveries && !conflictId
    && !pendingSaveRef.current && !uploadInFlight.current
    && !localSavesInFlight.current && !localSaveFailed.current
    && !document.querySelector('[role="dialog"]')
  ), [isLoaded, view, navOpen, showPasswordModal, showReportModal, showRecoveries, conflictId]);

  function markAsExternalChange() {
    skipLocalSaveRef.current = true;
    skipCloudPushRef.current = true;
  }

  /**
   * Signs out, first saying plainly if work on this device has not uploaded.
   *
   * The database now refuses uploads without a sign-in, so anything unsent
   * stays on this device until someone signs in here again. Nothing is deleted
   * either way; the warning is so nobody signs out believing it is on the server.
   */
  async function handleSignOut() {
    if (pendingSaveRef.current) {
      const outgoing = pendingSaveRef.current;
      pendingSaveRef.current = null;
      try { await saveSurveyOffline(outgoing); } catch { /* still in memory; warned below */ }
    }

    let unsent = [];
    try {
      unsent = (await listAllSurveysOffline()).filter((s) => s && s.pendingSync && surveyIsWorthSyncing(s));
    } catch { /* cannot tell; sign out as asked */ }

    if (unsent.length && isCloudConfigured && isOnline()) {
      // A last upload attempt, capped: with weak signal it would otherwise hold
      // the sign-out button for minutes. Whatever does not make it is listed.
      try {
        await withTimeout((async () => {
          await flushPendingSurveys();
          if (surveyRef.current && unsent.some((s) => s.id === surveyRef.current.id)) await pushAndSettle();
        })(), SIGN_OUT_UPLOAD_WAIT_MS, 'Upload before sign-out');
      } catch { /* report what is still unsent below */ }
      try {
        unsent = (await listAllSurveysOffline()).filter((s) => s && s.pendingSync && surveyIsWorthSyncing(s));
      } catch { /* keep the earlier list */ }
    }

    if (unsent.length) {
      const names = unsent
        .slice(0, 5)
        .map((s) => `• ${s.facility?.facilityName || s.facility?.facilityCode || 'Unnamed facility'}`)
        .join('\n');
      const more = unsent.length > 5 ? `\n…and ${unsent.length - 5} more` : '';
      const ok = confirm(
        `${unsent.length} ${unsent.length === 1 ? 'facility has' : 'facilities have'} not uploaded yet:\n\n`
        + `${names}${more}\n\n`
        + 'They stay safe on this device and will upload after someone signs in here again. Sign out anyway?'
      );
      if (!ok) return;
    }
    onSignOut();
  }

  /**
   * "Download Excel Report" in the account menu.
   *
   * It skipped fetching photo files, so a facility opened from another device
   * exported without its photos. It now goes through the same permission and
   * completeness checks as every other export.
   */
  async function handleHeaderExcel() {
    if (!mayDownloadReports || !surveyRef.current) return;
    try {
      const hydrated = await hydratePhotos(surveyRef.current);
      if (!confirmReportReady(hydrated)) return;
      await generateSurveyExcel(hydrated);
    } catch (err) {
      console.error('Excel report failed:', err);
      alert('Could not build the Excel report: ' + (err.message || err));
    }
  }

  /**
   * One place that decides which unhappy sync state the header should show.
   * Signed in and refused by the access rules means the role or project team
   * does not allow it -- signing in again would not help.
   */
  const failureState = (err) => (
    currentUser && isAccessRefused(err) ? 'refused' : isAuthFailure(err) ? 'unauthorized' : 'offline'
  );
  function reportSyncFailure(err) {
    setSyncState(failureState(err));
  }
  const [syncState, setSyncState] = useState(isCloudConfigured ? 'idle' : 'off');
  const [lastSynced, setLastSynced] = useState(null);
  useEffect(() => { if (syncState === 'synced') setLastSynced(Date.now()); }, [syncState]);
  const [creatingFacility, setCreatingFacility] = useState(false);
  // Admins hold everything; an ordinary surveyor holds only what was ticked
  // for them in Manage Users.
  const mayDeleteSnags = can(currentUser, 'delete_snags');
  const mayDownloadReports = can(currentUser, 'download_reports');
  // A build with no cloud has no sign-in and no roles: everything is allowed
  // there, as before. Signed in, the role decides (and the database enforces).
  const signedInUser = isCloudConfigured ? currentUser : null;
  const mayEditSurveys = !signedInUser || can(signedInUser, 'edit_surveys');
  const mayManageProjects = !signedInUser || can(signedInUser, 'manage_projects');
  const mayManageTeam = can(currentUser, 'manage_team');
  const mayManageUsers = can(currentUser, 'manage_users');
  const mayManageConfig = can(currentUser, 'manage_config');
  const mayManageTemplates = can(currentUser, 'manage_templates');
  const mayReview = can(currentUser, 'review_surveys') || can(currentUser, 'approve_surveys') || mayManageTeam;
  /** Which Admin Dashboard modules this user may open. */
  const mayOpenAdmin = (module) => ({
    forms: mayManageConfig, versions: mayManageConfig, audit: mayManageConfig, reports: mayManageConfig, rules: mayManageConfig, settings: mayManageConfig,
    users: mayManageUsers, roles: mayManageUsers, templates: mayManageTemplates
  })[module] === true;
  // Read by the upload path, which runs outside render.
  const mayEditRef = useRef(mayEditSurveys);
  mayEditRef.current = mayEditSurveys;
  // Whether the open facility is approved (locked); set once the list is known.
  const openLockedRef = useRef(false);
  // Which stat tile was last tapped. The nonce lets the same tile be tapped
  // twice and still scroll the list back into view.
  const [listFocus, setListFocus] = useState(null);
  // What the dashboard number that opened All Facilities counted.
  const [portalListFilter, setPortalListFilter] = useState(() => ({ ...facilityListFilter('all'), nonce: 0 }));
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
            reportSyncFailure(err);
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

  /**
   * A facility is worth sending to the server once it has anything a person
   * actually entered -- a name, or a snag with a location/defect/photo -- or
   * once it already exists there (has a cloudRevision), so a legitimate later
   * edit is never blocked. A brand-new facility with nothing typed into it
   * yet is neither.
   */
  function surveyIsWorthSyncing(s) {
    if (!s) return false;
    if (s.cloudRevision !== undefined) return true;
    const hasName = Boolean((s.facility?.facilityName || s.facility?.buildingName || '').trim());
    const hasSnagContent = (s.items || []).some(
      (i) => (i.defectDescription || '').trim() || (i.location || '').trim() || (i.photos || []).length
    );
    return hasName || hasSnagContent;
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
    // ROOT CAUSE of empty facilities appearing in the saved list: creating a
    // fresh blank facility sets `skipCloudPushRef` to suppress the very next
    // push, but that flag is only checked by the debounced autosave effect
    // below. pushAndSettle is also called directly by the reconnect handler,
    // which never looked at the flag at all -- so a network reconnect firing
    // around the same moment a blank facility was created bypassed the guard
    // entirely and uploaded it. A one-shot ref racing across two independent
    // effects is exactly the kind of thing that gets bypassed; checking the
    // survey's actual content instead means every caller is safe by
    // construction, not by remembering to check a flag.
    if (!surveyIsWorthSyncing(surveyRef.current)) {
      return { skipped: true, reason: 'empty' };
    }
    // A read-only role has nothing of its own to upload: opening a facility
    // must never send it back to the server under that account.
    if (!mayEditRef.current) {
      return { skipped: true, reason: 'read-only' };
    }
    // An approved facility is locked on the server, which refuses every write
    // to it. With nothing unsent there is nothing to upload, and trying anyway
    // turned every launch into a refusal and a red "No upload access" pill.
    // Work that IS waiting still goes up, so its refusal is reported.
    if (openLockedRef.current && !hasUnpushedEditsRef.current) {
      const stored = await getSurveyOffline(surveyRef.current.id);
      if (!stored?.pendingSync) return { skipped: true, reason: 'locked' };
    }

    if (uploadInFlight.current) {
      await uploadInFlight.current;
      return pushAndSettle();
    }
    const uploaded = surveyRef.current;
    const task = (async () => {
      const saved = await saveSurveyOffline(uploaded);
      if (saved?.conflict) {
        await saveSurveyRecovery({ ...uploaded, recoveryUserId: currentUser?.id });
        throw new Error('Another tab changed this facility. Your copy is in Recovery backups. Reload before syncing.');
      }
      const pushResult = await pushSurvey(uploaded);
      if (pushResult?.conflict) {
        setConflictId(uploaded.id);
        setSyncState('conflict');
        return pushResult;
      }
      if (!pushResult?.pushed) return pushResult;
      const receiptSaved = await markSurveySynced(uploaded.id, uploaded, pushResult);
      if (surveyRef.current?.id !== uploaded.id) return pushResult;
      const next = settleUpload(surveyRef.current, uploaded, pushResult);
      if (!receiptSaved) next.pendingSync = true;
      hasUnpushedEditsRef.current = next.pendingSync;
      if (!next.pendingSync) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        pendingSaveRef.current = null;
        skipLocalSaveRef.current = true;
      }
      skipCloudPushRef.current = true;
      surveyRef.current = next;
      setSurvey(next);
      setConflictId((id) => id === uploaded.id ? null : id);
      setSyncState(next.pendingSync ? 'offline' : 'synced');
      return pushResult;
    })();
    uploadInFlight.current = task;
    try { return await task; } finally { uploadInFlight.current = null; }
  }

  async function useServerAfterRecovery(device, remote) {
    if (surveyRef.current?.id !== device.id || contentKey(surveyRef.current) !== contentKey(device)) {
      throw new Error('The device copy changed. Compare again before choosing.');
    }
    await saveSurveyRecovery({ ...device, recoveryUserId: currentUser?.id });
    if (surveyRef.current?.id !== device.id || contentKey(surveyRef.current) !== contentKey(device)) {
      throw new Error('New edits were made during backup. They remain on this screen.');
    }
    const stored = await saveSurveyOffline(remote, { pendingSync: false });
    if (stored?.conflict) throw new Error('Another tab changed this facility. Reload before choosing a copy.');
    if (surveyRef.current?.id !== device.id || contentKey(surveyRef.current) !== contentKey(device)) {
      if (surveyRef.current?.id === device.id) await saveSurveyOffline(surveyRef.current);
      throw new Error('New edits were made while saving. Compare again; they remain on this device.');
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    pendingSaveRef.current = null;
    hasUnpushedEditsRef.current = false;
    markAsExternalChange();
    surveyRef.current = remote;
    setSurvey(remote);
    setConflictId(null);
    setSyncState('synced');
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
  async function uploadSurveyRecord(record) {
    const result = await uploadRecord(record, { push: pushSurvey, markSynced: markSurveySynced });
    if (result?.conflict) setConflictId(record.id);
    if (result?.pushed && surveyRef.current?.id === record.id) {
      const next = settleUpload(surveyRef.current, record, result);
      if (result.pendingLocal) next.pendingSync = true;
      hasUnpushedEditsRef.current = next.pendingSync;
      if (!next.pendingSync) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        pendingSaveRef.current = null;
        skipLocalSaveRef.current = true;
      }
      skipCloudPushRef.current = true;
      surveyRef.current = next;
      setSurvey(next);
    }
    return result;
  }

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
    let authError = null;
    const problems = [];
    for (const local of stored) {
      if (!local || !local.id || !local.pendingSync) continue;
      if (local.id === surveyRef.current?.id) continue;   // pushAndSettle owns this one
      // An untouched blank survey is not worth a round trip. Checked by content,
      // not snag count: every new facility starts with one empty snag, so
      // "has no snags" let blank facilities through and they reached the server.
      if (!local.submittedAt && !surveyIsWorthSyncing(local)) continue;

      const label = local.facility?.facilityName || local.facility?.buildingName || local.id;
      try {
        const res = await uploadSurveyRecord(local);

        if (res && res.pushed && !res.failedPhotoIds?.length) {
          flushed++;
        } else if (res?.pushed && res.failedPhotoIds?.length) {
          failed++;
          problems.push(`${label}: photos are still waiting to upload`);
        } else if (res && res.conflict) {
          // 'destructive': this device holds far less than the server. Refusing
          // is correct -- uploading would look like a mass deletion.
          failed++;
          problems.push(`${label}: changed on another device; open the facility to compare copies`);
        }
      } catch (err) {
        failed++;
        if (isAuthFailure(err)) authError = err;
        problems.push(`${label}: ${err.message}`);
        console.info('[sync] still pending, will retry on the next connection:', local.id, err.message);
      }
    }

    if (flushed) {
      console.info(`[sync] uploaded ${flushed} facility(ies) recorded offline`);
    }
    if (flushed || failed) await refreshSurveyList();
    return { flushed, failed, problems, authError };
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
    // The open facility failing used to be logged and then ignored: with the
    // server unreachable this reported "All data synced" and "everything is
    // already uploaded".
    let currentError = null;
    try {
      if (surveyRef.current) {
        const res = await pushAndSettle();
        pushedCurrent = Boolean(res && res.pushed);
        if (res?.conflict) currentError = new Error("This facility changed on another device. Open it to compare copies; your edits are kept here.");
        else if (res?.failedPhotoIds?.length) currentError = new Error("Some photos are still waiting to upload.");
      }
    } catch (err) {
      currentError = err;
      console.info('Sync of the open facility deferred:', err.message);
    }

    const { flushed, failed, problems, authError } = await flushPendingSurveys();
    await refreshSurveyList();

    const refusedError = [currentError, authError].find((e) => e && failureState(e) === 'refused');
    const signInError = [currentError, authError].find((e) => e && failureState(e) === 'unauthorized');
    if (signInError) setSyncState('unauthorized');
    else if (refusedError) setSyncState('refused');
    else if (currentError || failed) setSyncState('offline');
    else setSyncState('synced');

    if (signInError) {
      return { message: 'Sign in again to upload. Your work is saved on this device.' };
    }
    if (refusedError && isLockedRefusal(refusedError)) {
      return {
        message: 'This facility has been approved and is locked, so the changes on this device cannot upload. '
          + 'They are kept here -- ask a Manager or Admin to reopen the facility, then sync again.'
      };
    }
    if (refusedError) {
      return {
        message: 'Your role or project team does not allow this upload. The work is kept on this device -- '
          + 'ask an administrator to add you to the project team, then sync again.'
      };
    }
    if (currentError || failed) {
      const unreachable = (msg) => /failed to fetch|network|timed out|load failed/i.test(String(msg || ''));
      // Count facilities actually holding unsent work, not upload attempts --
      // the open facility is always attempted even when it has nothing new.
      let stillWaiting = (currentError ? 1 : 0) + failed;
      try {
        stillWaiting = (await listAllSurveysOffline())
          .filter((s) => s && s.pendingSync && surveyIsWorthSyncing(s)).length;
      } catch { /* keep the attempt count */ }
      const why = [currentError?.message, ...problems].some(unreachable)
        ? 'The server could not be reached.'
        : [currentError && `The open facility: ${currentError.message}`, ...problems].filter(Boolean).join('; ') + '.';
      if (!stillWaiting) {
        return { message: `Nothing on this device is waiting to upload. ${why} Changes made on other devices may not show until it can be reached.` };
      }
      return {
        message: `${flushed} uploaded, ${stillWaiting} still waiting. ${why} Your work is saved on this device and will upload automatically.`
      };
    }
    if (flushed) return { message: `${flushed} facility(ies) uploaded.` };
    if (pushedCurrent) return { message: 'Up to date. Everything is on the server.' };
    return { message: 'Nothing waiting — everything is already uploaded.' };
  };

  /** The button in Saved Facilities. */
  const handleSyncNow = syncEverything;
  useEffect(() => {
    if (!isLoaded || !isCloudConfigured || !online || syncState !== 'offline') return;
    const timer = setTimeout(() => { syncEverything().catch(reportSyncFailure); }, 30000);
    return () => clearTimeout(timer);
  }, [isLoaded, online, syncState]);

  // Load from IndexedDB on initial launch
  useEffect(() => {
    async function initStorage() {
      try {
        const saved = await loadCurrentSurveyOffline();

        const localHasUnpushedWork =
          saved && saved.pendingSync && Array.isArray(saved.items) && (saved.items.length > 0 || isQhse(saved));

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
                // Came from the server: not an edit to save or send back. Left
                // unmarked, every launch re-flagged it as unsent and uploaded
                // it again -- refused, since Stage 6, for approved facilities.
                markAsExternalChange();
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

    // Switching facility cancels the previous save timer, so an edit made just
    // before the switch was never written anywhere. Save the outgoing facility
    // now, before the early return below (opening another facility marks the
    // change as external), then upload it once it is stored.
    const outgoing = pendingSaveRef.current;
    if (outgoing && outgoing.id !== survey?.id) {
      pendingSaveRef.current = null;
      localSavesInFlight.current += 1;
      saveSurveyOffline(outgoing)
        .then(() => {
          if (isCloudConfigured && isOnline()) flushPendingSurveys().catch(() => {});
        })
        .catch((err) => { localSaveFailed.current = true; console.error('Could not save the facility being left:', err); })
        .finally(() => { localSavesInFlight.current -= 1; });
    }

    // This change came from another tab, so it is already saved.
    if (skipLocalSaveRef.current) {
      skipLocalSaveRef.current = false;
      return;
    }

    hasUnpushedEditsRef.current = true;
    pendingSaveRef.current = survey;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (pendingSaveRef.current === survey) pendingSaveRef.current = null;
      localSavesInFlight.current += 1;
      try {
        const result = await saveSurveyOffline(survey);

        // Refused because another tab had newer data. Take theirs rather than
        // silently destroying it.
        if (result && result.conflict) {
          await saveSurveyRecovery({ ...survey, recoveryUserId: currentUser?.id });
          setShowRecoveries(true);
          markAsExternalChange();
          setSurvey(result.stored);
        }
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        localSaveFailed.current = true;
        console.error('Auto-save error:', err);
      } finally {
        localSavesInFlight.current -= 1;
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
        reportSyncFailure(err);
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
   * Marks one facility submitted and stores it, without starting a new one.
   *
   * Local storage first: that is what guarantees the submission survives with
   * no signal. The upload is attempted afterwards and its failure is not fatal,
   * because the facility is already saved as pending and flushes on reconnect.
   */
  async function submitSurveyRecord(record) {
    if (blockedByRequiredFields(record)) return false;
    const submitted = {
      ...record,
      status: 'submitted',
      submittedAt: new Date().toISOString()
    };
    try {
      await saveSurveyOffline(submitted, { pendingSync: true });
    } catch (err) {
      console.error('Could not save the submitted facility:', err);
      alert('Could not save this facility locally. Nothing has been changed.');
      return false;
    }

    if (surveyRef.current?.id === submitted.id) {
      surveyRef.current = submitted;
      setSurvey(submitted);
    }

    if (isCloudConfigured && isOnline()) {
      try {
        setSyncState('syncing');
        const res = await uploadSurveyRecord(submitted);
        // A refused push (the server holds far more) is not an upload; the
        // facility stays flagged unsent so it is not quietly dropped.
        setSyncState(res?.conflict ? 'conflict' : res?.pushed && !res.failedPhotoIds?.length ? 'synced' : 'offline');
      } catch (err) {
        console.info('Submitted facility will upload when there is a connection:', err.message);
        reportSyncFailure(err);
      }
    }
    refreshSurveyList();
    return true;
  }

  /**
   * Submits a facility straight from the Saved Facilities list, so one left as
   * a draft can be finished without opening it first.
   */
  const handleSubmitFromList = async (surveyId) => {
    const fromList = surveyList.find((s) => s.id === surveyId);
    const local = (await listAllSurveysOffline()).find((s) => s && s.id === surveyId);
    let record = surveyRef.current?.id === surveyId ? surveyRef.current : local;

    if (!record && isCloudConfigured && isOnline()) {
      record = await pullSurvey(surveyId, {});
    }
    if (!record) {
      alert('That facility could not be loaded. Check your connection and try again.');
      return;
    }

    const name = (record.facility?.facilityName || fromList?.facilityName || '').trim();
    const hasWork = (record.items || []).some(
      (i) => (i.defectDescription || '').trim() || (i.location || '').trim()
    );
    if (!hasWork) {
      alert('Add at least one snag before submitting this facility.');
      return;
    }
    // Before the confirmation, so nobody confirms a submission that is then refused.
    if (blockedByRequiredFields(record)) return;
    if (!confirm(`Submit "${name || 'this facility'}"?\n\nIt stays available in the list for reports.`)) return;

    await submitSurveyRecord(record);
  };

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
      blockedByRequiredFields(current);
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
    if (blockedByRequiredFields(current)) return;
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
        const res = await uploadSurveyRecord(submitted);
        // A refused push (the server holds far more) is not an upload; the
        // facility stays flagged unsent so it is not quietly dropped.
        setSyncState(res?.conflict ? 'conflict' : res?.pushed && !res.failedPhotoIds?.length ? 'synced' : 'offline');
      } catch (err) {
        console.info('Submitted facility will upload when there is a connection:', err.message);
        reportSyncFailure(err);
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
  /**
   * The facility list: the server's, merged with whatever is on this device.
   *
   * With no connection it used to show nothing at all -- the device rows lost
   * their projectId in the merge, so the project screen filtered every one out,
   * and only after waiting ~16s for the request to fail. It now uses the last
   * downloaded list straight away when offline, and within a few seconds when
   * the signal is too weak to answer.
   */
  const refreshSurveyList = async () => {
    let remote = [];
    let remoteIsCached = false;

    if (isCloudConfigured) {
      if (isOnline()) {
        try {
          remote = await withTimeout(listSurveys(), LIST_WAIT_MS, 'Loading facilities');
        } catch (err) {
          if (isAuthFailure(err)) setSyncState('unauthorized');
          remote = cachedSurveyList();
          remoteIsCached = true;
        }
      } else {
        remote = cachedSurveyList();
        remoteIsCached = true;
      }
    }

    let local = [];
    try { local = await listAllSurveysOffline(); } catch { /* list what the server has */ }

    // Which projects this account may see, when the server can say so.
    let visibleProjectIds = null;
    if (isCloudConfigured && !remoteIsCached) {
      try { visibleProjectIds = await withTimeout(listVisibleProjectIds(), LIST_WAIT_MS, 'Loading projects'); } catch { /* show the device copies */ }
    }

    setSurveyList(mergeSurveyLists(remote, local, {
      remoteIsCached,
      serverIsAuthoritative: isCloudConfigured && !remoteIsCached,
      visibleProjectIds
    }));
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
  /**
   * Opens a facility from the list.
   *
   * The device copy is checked first. If it holds edits that never uploaded it
   * is opened as it is and left to upload: taking the server copy here and
   * saving it over the device copy as "synced" permanently destroyed those
   * edits. With no connection the device copy is opened instead of refusing.
   */
  const handleOpenSurvey = async (surveyId) => {
    // Already loaded (the facility the app opened in the background, or the
    // one last worked on): show it. Returning silently made "Open" look dead.
    if (surveyId === survey?.id) { setView('survey'); return surveyRef.current; }
    setSyncState('syncing');

    const local = await getSurveyOffline(surveyId);

    let remote = null;
    let remoteError = null;
    // An unsent device copy is opened as it is, so the server copy (and all its
    // photos) would be downloaded only to be thrown away. When a device copy
    // exists, the server gets a few seconds and no more: with weak signal a
    // request takes ~16s to fail, and the surveyor is standing there waiting.
    if (!(local && local.pendingSync) && isCloudConfigured && isOnline()) {
      try {
        if (local) {
          remote = await withTimeout(pullSurvey(surveyId, collectKnownPhotos(local)), OPEN_WAIT_MS, 'Opening facility');
        } else if (await withTimeout(surveyExistsOnServer(surveyId), OPEN_WAIT_MS, 'Reaching the server')) {
          // Nothing to fall back on, so the download itself is waited out.
          remote = await pullSurvey(surveyId, {});
        }
      } catch (err) {
        remoteError = err;
      }
    } else if (!isOnline() && !local) {
      remoteError = new Error('offline');
    }

    const { survey: chosen, source, reason } = chooseSurveyToOpen(local, remote);

    if (!chosen) {
      if (remoteError && isAuthFailure(remoteError)) {
        setSyncState('unauthorized');
        alert('Your sign-in has expired. Sign in again to open this facility.');
      } else if (remoteError || !isOnline()) {
        setSyncState('offline');
        alert('This facility has not been downloaded to this device yet. Connect to the internet to open it.');
      } else {
        setSyncState('idle');
        alert('That facility could not be found. It may have been deleted on another device.');
      }
      return;
    }

    // A facility recorded before projects existed has no project. Adopt it
    // into the one being worked in rather than leaving it unreachable.
    const project = activeProjectRef.current;
    if (project && !chosen.projectId) {
      chosen.projectId = project.id;
      if (source === 'remote') {
        assignFacilityToProject(chosen.id, project.id).catch(() => { /* retried on next push */ });
      }
    }

    if (source === 'remote') {
      markAsExternalChange();
      setSurvey(chosen);
      await saveSurveyOffline(chosen, { pendingSync: false });
      setSyncState('synced');
    } else if (reason === 'unsent-edits') {
      // Already stored exactly as it is, so skip the local save -- but let the
      // upload run, because none of this has reached the server.
      skipLocalSaveRef.current = true;
      hasUnpushedEditsRef.current = true;
      setSurvey(chosen);
      setSyncState(isOnline() ? 'syncing' : 'offline');
    } else {
      markAsExternalChange();
      setSurvey(chosen);
      if (!remoteError) setSyncState('idle');
      else reportSyncFailure(remoteError);
    }
    setView('survey');
    return chosen;
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
      const all = await listProjects({ includeDeleted: true });
      const list = all.filter(p => !p.deletedAt);
      setProjects(list); setDeletedProjects(all.filter(p => p.deletedAt));
      return list;
    } catch (err) {
      console.warn('[projects] could not load:', err.message);
      return cachedProjects();
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await refreshProjects();
      if (cancelled) return;

      // Remember which project was last used, so opening it manually is one
      // tap, but do NOT jump straight into it. Auto-advancing past the
      // project screen on every launch was the opposite of the point of
      // having one: the app must always start by asking "which project?",
      // never assume the answer from last time.
      const savedId = getActiveProjectId();
      const restored = savedId ? list.find((p) => p.id === savedId) : null;
      if (restored) setActiveProject(restored);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const handleOpenProject = (project) => {
    activeProjectRef.current = project;
    setActiveProject(project);
    setActiveProjectId(project.id);
    setView(workModule === 'qhse' ? 'qhse' : 'facilities');
    refreshSurveyList();
  };

  /**
   * Offers to submit the open facility before leaving it.
   *
   * A surveyor who finishes a site and taps straight back left it sitting as a
   * draft, which is how facilities ended up unsubmitted with work in them.
   * Cancel stays put; declining still leaves the work saved as a draft.
   */
  async function offerSubmitBeforeLeaving() {
    const current = surveyRef.current;
    if (!current || current.status === 'submitted') return true;

    const name = (current.facility?.facilityName || '').trim();
    const hasWork = (current.items || []).some(
      (i) => (i.defectDescription || '').trim() || (i.location || '').trim() || (i.photos || []).length
    );
    if (!name || !hasWork) return true;

    const answer = confirm(
      `Submit "${name}" before going back?\n\n`
      + 'OK submits it and it stays available for reports.\n'
      + 'Cancel leaves it as a draft you can come back to.'
    );
    if (answer) await submitSurveyRecord(current);
    return true;
  }

  useEffect(() => {
    if (!isLoaded || !currentUser) return;
    if (view !== 'survey' && view !== 'projects' && view !== 'home') return;
    let cancelled = false;
    listTemplates()
      .then((list) => { if (!cancelled) setTemplates(list); })
      .catch(() => { /* the cached list stays in use */ });
    return () => { cancelled = true; };
  }, [isLoaded, currentUser, view]);

  /**
   * The survey with a template's checklist added. Untouched blank snags are
   * dropped and tombstoned so another device cannot bring them back; nothing
   * the surveyor has written is changed. Returns null when nothing was added.
   */
  function withTemplateApplied(record, template) {
    const applied = applyTemplateToItems(record.items || [], template);
    if (!applied.added) return { record, applied };
    return {
      applied,
      record: {
        ...record,
        items: applied.items,
        deletedItemIds: [...new Set([...(record.deletedItemIds || []), ...applied.removedBlankIds])],
        // The template a facility was started from; loading another later
        // adds its snags but does not rewrite that history.
        facility: record.facility?.templateId
          ? record.facility
          : { ...(record.facility || {}), templateId: template.id, templateName: template.name }
      }
    };
  }

  /** Survey Items tab: adds a template's checklist to the open facility. */
  const handleApplyTemplate = (template) => {
    const current = surveyRef.current;
    if (!current || !template) return null;
    const { record, applied } = withTemplateApplied(current, template);
    if (applied.added) {
      surveyRef.current = record;
      setSurvey(record);   // autosave and upload follow as for any edit
    }
    return applied;
  };

  /** Where a web portal menu, search result or dashboard link leads. */
  const navigatePortal = (target) => {
    if (!target) return;
    if (target.admin) { openAdmin(target.admin); return; }
    if (target.module) { setWorkModule(target.module); setView('projects'); refreshProjects(); refreshSurveyList(); return; }
    if (target.view === 'reports' && target.reportModule) setWorkModule(target.reportModule);
    if (!['modules', 'admin', 'reports'].includes(target.view)) setWorkModule('condition');
    if (target.view === 'allFacilities') { openFacilityList('all'); return; }
    if (target.view === 'facilities' && !activeProjectRef.current) { setView('projects'); return; }
    if (['home', 'qhse', 'reports'].includes(target.view)) refreshSurveyList();
    setView(target.view);
  };

  async function startQhse(projectId, template = null) {
    if (!mayEditSurveys) return;
    if (surveyRef.current) {
      const kept = await saveSurveyOffline(surveyRef.current);
      if (kept?.conflict) throw new Error('Resolve the current inspection conflict before starting another.');
    }
    const project = projects.find(p => p.id === projectId) || activeProjectRef.current;
    if (!project || project.id !== projectId) throw new Error('Select a project first.');
    const fresh = createQhse(projectId, await nextFacilityNumber(), project, template);
    fresh.facility.surveyorName = currentUser?.full_name || currentUser?.name || '';
    setWorkModule('qhse');
    const saved = await saveSurveyOffline(fresh, { pendingSync: true });
    if (saved?.conflict) throw new Error('Could not create the inspection.');
    skipCloudPushRef.current = false;
    surveyRef.current = fresh; setSurvey(fresh);
    setActiveProject(projects.find(p => p.id === projectId) || null);
    setView('survey'); await refreshSurveyList();
  }

  /** Opens a facility from the dashboard or search, with its project as context. */
  const openSurveyFromPortal = async (surveyId) => {
    const row = surveyList.find((s) => s.id === surveyId);
    const project = row?.projectId ? projects.find((p) => p.id === row.projectId) : null;
    if (project) {
      activeProjectRef.current = project;
      setActiveProject(project);
      setActiveProjectId(project.id);
    }
    setWorkModule(isQhse(row) ? 'qhse' : 'condition');
    await handleOpenSurvey(surveyId);
  };

  /** Dashboard "Create New Project": the project list with its form open. */
  const openCreateProject = () => {
    setCreateProjectSignal(Date.now());
    setView('projects');
  };

  /**
   * Opens All Facilities filtered to exactly what a dashboard number counted:
   * 'all' / 'submitted' / 'draft', or { priority, evidence, projectId }. The
   * dashboard counts across every project, so the list does too -- a list of
   * one project could never add up to the number that was clicked.
   */
  const openFacilityList = (target) => {
    setPortalListFilter({ ...facilityListFilter(target), nonce: Date.now() });
    setView('allFacilities');
  };

  const dashboardCrumb = isWebPortal ? () => navigatePortal({ view: 'home' }) : undefined;

  const backBusy = useRef(false);
  const backAction = useRef(null);
  const parentScreen = backTarget({ view, qhse: view === 'reports' ? workModule === 'qhse' : isQhse(survey), hasProject: !!activeProject, activeTab });
  async function handleAppBack(native = false) {
    if (backBusy.current) return;
    if (navOpen) { setNavOpen(false); return; }
    if (showReportModal) { setShowReportModal(false); return; }
    if (showPasswordModal) { setShowPasswordModal(false); return; }
    if (showRecoveries) { setShowRecoveries(false); return; }
    const preview = document.querySelector('[role="dialog"][aria-label="QHSE report preview"]');
    if (preview) { preview.querySelector('button')?.click(); return; }
    backBusy.current = true;
    try {
      if ((view === 'survey' || !parentScreen) && mayEditOpen) {
        const saved = await saveSurveyOffline(surveyRef.current);
        if (saved?.conflict) { setConflictId(surveyRef.current.id); setSyncState('conflict'); return; }
      }
      if (!parentScreen) {
        if (native === true && confirm('Close the app? Your saved drafts and photos will remain on this device.')) await NativeApp.exitApp();
        return;
      }
      if (parentScreen.tab) setActiveTab(parentScreen.tab);
      setView(parentScreen.view);
      refreshSurveyList();
    } catch (error) { alert(`Could not go back safely: ${error.message}`); }
    finally { backBusy.current = false; }
  }
  backAction.current = () => handleAppBack(true);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('App')) return;
    const remove = installAndroidBackHandler(NativeApp, () => backAction.current?.());
    return () => { remove().catch(error => console.warn('Back listener cleanup:', error.message)); };
  }, []);

  async function handleMoveLegacyQhse(id) {
    if (!mayEditSurveys) throw new Error('Your role cannot move inspections.');
    const row = surveyList.find(s => s.id === id);
    if (!row || !isLegacyQhse(row) || row.projectId !== activeProjectRef.current?.id) throw new Error('Select the project containing this older QHSE report.');
    if (isLocked(row)) throw new Error('This approved report must be reopened before moving it.');
    if (mayEditOpen) {
      const kept = await saveSurveyOffline(surveyRef.current);
      if (kept?.conflict) throw new Error('Resolve the current draft conflict before moving another report.');
    }
    const record = await handleOpenSurvey(id);
    if (!record) throw new Error('The older report could not be opened.');
    if (isLocked(record)) throw new Error('This approved report must be reopened before moving it.');
    await saveSurveyRecovery({ ...record, recoveryUserId: currentUser?.id });
    const moved = moveLegacyQhse(record, activeProjectRef.current);
    const saved = await saveSurveyOffline(moved);
    if (saved?.conflict) throw new Error('This report changed on another device. Compare the copies before moving it.');
    surveyRef.current = moved; setSurvey(moved);
    skipCloudPushRef.current = false; hasUnpushedEditsRef.current = true;
    setWorkModule('qhse'); setView('survey');
    await refreshSurveyList();
  }

  async function handleQhseAction(id, action) {
    const deleting = ['delete', 'restore'].includes(action);
    if (!(deleting ? (!isCloudConfigured || mayDeleteSnags) : mayEditSurveys)) throw new Error('You do not have permission for this inspection action.');
    if (mayEditOpen) {
      const kept = await saveSurveyOffline(surveyRef.current);
      if (kept?.conflict) throw new Error('Resolve the current inspection conflict first.');
    }
    const record = await handleOpenSurvey(id);
    if (!record) throw new Error('Could not load the inspection. Check your connection.');
    const next = changeInspectionState(record, action);
    if (['delete', 'submit'].includes(action)) await saveSurveyRecovery({ ...record, recoveryUserId: currentUser?.id, recoveryReason: action === 'submit' ? 'Before submission' : 'Before deletion' });
    const saved = await saveSurveyOffline(next, { pendingSync: true });
    if (saved?.conflict) throw new Error('This inspection changed in another tab. Resolve the conflict first.');
    surveyRef.current = saved; setSurvey(saved);
    skipCloudPushRef.current = false; hasUnpushedEditsRef.current = true;
    setWorkModule('qhse');
    if (deleting) setView('qhse');
    if (isCloudConfigured && isOnline()) {
      try {
        setSyncState('syncing'); const result = await uploadSurveyRecord(saved);
        if (result?.conflict) throw new Error('Saved on this device, but the server copy changed. Resolve the sync conflict before continuing.');
      } catch (e) { reportSyncFailure(e); if (e.message.includes('server copy changed')) throw e; }
    }
    await refreshSurveyList();
  }

  async function handleProjectTrash(project, deleted) {
    if (!mayManageProjects) throw new Error('You do not have permission to manage projects.');
    if (deleted) {
      const local = await listAllSurveysOffline();
      if (local.some(s => s.projectId === project.id && !isDeletedInspection(s)))
        throw new Error('Delete or move the existing inspections and Condition Survey facilities before deleting this shared project.');
    }
    await setProjectDeleted(project, deleted);
    if (deleted && activeProjectRef.current?.id === project.id) {
      setActiveProject(null); activeProjectRef.current = null; setActiveProjectId(null);
    }
    await refreshProjects();
  }

  useScreenScroll(`${currentUser?.id || 'device'}:${workModule}:${view}:${view === 'projects' ? '' : activeProject?.id || ''}:${view === 'survey' ? survey?.id : ''}`, isLoaded && !(view === 'projects' && projectsLoading));

  const handleBackToProjects = async () => {
    if (view === 'survey' && !(await offerSubmitBeforeLeaving())) return;
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

  // Every list and count works from these: the facilities with each one's
  // due date resolved (its own, else its project's), for Overdue.
  const listRows = useMemo(() => withDueDates(surveyList.filter(s => !isQhse(s)), projects), [surveyList, projects]);

  /** Facilities belonging to the open project, and nothing else. */
  const facilitiesInProject = activeProject
    ? listRows.filter((s) => s.projectId === activeProject.id)
    : [];

  /**
   * The open facility's place in review and approval: its own status (which
   * may be newer on this device) with the review status from the server list,
   * or from the copy last downloaded when the list does not have it.
   */
  const openRow = survey ? listRows.find((r) => r.id === survey.id) : null;
  const openStage = survey ? {
    status: survey.status,
    reviewStatus: openRow && !openRow.localOnly ? openRow.reviewStatus : (survey.review?.status ?? null),
    reviewNote: openRow && !openRow.localOnly ? openRow.reviewNote : (survey.review?.note ?? null),
    approvedAt: openRow?.approvedAt ?? survey.review?.approvedAt ?? null
  } : null;
  const openIsLocked = !!openStage && isLocked(openStage);
  openLockedRef.current = openIsLocked;
  const mayEditOpen = mayEditSurveys && !openIsLocked;
  useEffect(() => {
    if (view !== 'survey' || !mayEditOpen || !activeProject || !isQhse(survey) || survey.projectId !== activeProject.id) return;
    if (survey.facility?.qhse?.projectName === activeProject.name && survey.facility?.facilityName === activeProject.name) return;
    setSurvey(prev => ({ ...prev, facility: { ...prev.facility, facilityName: activeProject.name,
      qhse: { ...prev.facility.qhse, projectName: activeProject.name } } }));
  }, [view, mayEditOpen, activeProject, survey?.id, survey?.facility?.qhse?.projectName]);
  const [workflowBusy, setWorkflowBusy] = useState(null);
  // Until the database records reviews, the facility screen offers no review
  // steps (they would fail) and shows no review banner.
  const [workflowReady, setWorkflowReady] = useState(false);
  useEffect(() => {
    if (!currentUser) return undefined;
    let cancelled = false;
    workflowBackendReady().then((ok) => { if (!cancelled) setWorkflowReady(ok); }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  /** A review step taken from the facility screen. */
  const handleWorkflowStep = async (action) => {
    const current = surveyRef.current;
    if (!current) return;
    let note = null;
    if (action === 'request_changes') {
      note = window.prompt('What should the surveyor change? They will see this note.');
      if (!note || !note.trim()) return;
    } else if (action === 'reopen') {
      note = window.prompt('Reopen this approved facility for changes? Add a reason (optional).', '');
      if (note === null) return;
    }
    setWorkflowBusy(action);
    try {
      const fields = await moveFacility(current.id, action, note);
      // The server changed status, review and revision; take exactly those,
      // so the next upload builds on the revision just written.
      const next = {
        ...current,
        status: fields.status,
        review: { status: fields.reviewStatus, note: fields.reviewNote, reviewedAt: fields.reviewedAt, approvedAt: fields.approvedAt },
        revision: fields.revision,
        cloudRevision: fields.revision
      };
      markAsExternalChange();
      setSurvey(next);
      await saveSurveyOffline(next, { pendingSync: !!current.pendingSync });
      refreshSurveyList();
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkflowBusy(null);
    }
  };

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
  /**
   * Creates the facility, then moves on to its snags.
   *
   * Pushing here is what fixes the reference number: the database assigns it,
   * so two surveyors creating a facility at the same moment cannot both take
   * FAC-079 the way they have before. With no signal the facility is still
   * created locally and keeps a provisional number until it next syncs -- a
   * surveyor in a plant room must never be blocked from starting work.
   */
  const handleCreateFacility = async (template = null) => {
    const name = (surveyRef.current?.facility?.facilityName || '').trim();
    if (!name) return;

    setCreatingFacility(true);
    try {
      // The template goes in before the first save, so the facility and its
      // checklist snags reach the server together in one upload.
      if (template) {
        const { record, applied } = withTemplateApplied(surveyRef.current, template);
        if (applied.added) {
          surveyRef.current = record;
          setSurvey(record);
        }
      }
      await saveSurveyOffline(surveyRef.current, { markPending: true });
      if (isCloudConfigured && isOnline()) {
        try {
          await pushAndSettle();
        } catch (err) {
          console.warn('Facility created locally; it will sync when there is a connection:', err?.message);
        }
      }
      // Without this the facility exists but the Saved Facilities list still
      // shows the set it was loaded with, so the one just created is missing
      // until something else happens to refresh it.
      refreshSurveyList();
      setActiveTab('items');
    } finally {
      setCreatingFacility(false);
    }
  };

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
    const safeTitle = (survey.facility?.facilityName || survey.facility?.buildingName || 'survey')
      .replace(/\s+/g, '_').toLowerCase();
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
    <SubmissionValidation.Provider value={validationSurveyId === survey?.id}>
    <Suspense fallback={<div role="status" className="p-6 text-slate-600">Loading screen…</div>}>
    <div className="workspace-app min-h-screen bg-[#f4f8fd] flex font-sans">
      {(
        <PortalSidebar
          desktop={isWebPortal}
          workModule={workModule}
          current={view === 'admin' ? { admin: adminModule } : { view, ...(view === 'reports' ? { reportModule: workModule } : {}) }}
          access={{ config: mayManageConfig, users: mayManageUsers, templates: mayManageTemplates, review: mayReview, admin: isAdminUser(currentUser) }}
          /* Only once a project is open: on the project list a "Facilities"
             entry would point at a project nobody has chosen. */
          hasOpenProject={!!activeProject && workModule === 'condition' && !['modules', 'projects'].includes(view)}
          onNavigate={navigatePortal}
          open={navOpen}
          onClose={() => setNavOpen(false)}
          onRecoveries={() => setShowRecoveries(true)}
        />
      )}
      <div className="min-h-screen flex-1 flex flex-col min-w-0">
      {/* Top Header */}
      <Header
        survey={survey || {}}
        onOpenRecoveries={() => setShowRecoveries((v) => !v)}
        onReset={handleReset}
        onOpenReport={() => setShowReportModal(true)}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportJSON}
        onExportExcel={handleHeaderExcel}
        lastSaved={lastSavedTime}
        lastSynced={lastSynced}
        onSyncNow={isCloudConfigured ? handleSyncNow : undefined}
        pendingInspections={surveyList.filter(s => s.pendingSync).length}
        syncState={syncState}
        online={online}
        pendingCount={pendingPhotoCount}
        currentUser={currentUser}
        canDownloadReports={mayDownloadReports}
        canEdit={mayEditSurveys}
        // On the hub screens the subtitle is the project you are in, not a
        // facility -- "New Facility Assessment" there would be misleading.
        contextLabel={
          view === 'survey' && isQhse(survey) ? 'QHSE Inspection' : view === 'survey'
            ? ''
            : (view === 'modules' ? 'Choose a module' : `${workModule === 'qhse' ? 'QHSE Inspection' : 'Condition Survey'}${activeProject && view !== 'projects' ? ' · ' + activeProject.name : ''}`)
        }
        // Reports need a facility behind them, so the shortcut only belongs on
        // the survey screens; the hub screens have their own Reports entry.
        showReports={view === 'survey' && !isQhse(survey)}
        onOpenUsers={() => (isWebPortal ? openAdmin('users') : setView('users'))}
        onOpenNav={() => setNavOpen(true)}
        searchSlot={isWebPortal ? (
          <GlobalSearch
            surveys={surveyList}
            projects={projects}
            isAdmin={isAdminUser(currentUser)}
            onOpenSurvey={openSurveyFromPortal}
            onOpenProject={handleOpenProject}
            onNavigate={navigatePortal}
          />
        ) : null}
        onChangePassword={() => setShowPasswordModal(true)}
        onSignOut={onSignOut ? handleSignOut : undefined}
      />

      {parentScreen && !['projects', 'qhse'].includes(view) && !(view === 'survey' && isQhse(survey)) && <div className="px-3 sm:px-8 py-3"><BackButton onClick={() => handleAppBack()}>Back to {parentScreen.label}</BackButton></div>}

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}

      {/* Navigation belongs to a chosen facility: the five tabs all act on one
          survey, so showing them before a facility is picked would offer
          modules with nothing behind them. */}
      {view === 'survey' && !isQhse(survey) && (
        <Navigation
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          itemsCount={(survey?.items || []).length}
          urgentCount={urgentCount}
        />
      )}

      {/* Web portal dashboard. */}
      {view === 'home' && (
        <main className="flex-1 w-full px-3 sm:px-5 pt-4 md:pb-6">
          <PortalHome
            currentUser={currentUser}
            surveys={listRows}
            projects={projects}
            formsConfig={formsConfig}
            formsVersion={formsVersion}
            templates={templates}
            loading={projectsLoading}
            onCreateProject={mayManageProjects ? openCreateProject : null}
            onOpenList={openFacilityList}
            onViewReports={() => setView('reports')}
            onOpenSurvey={openSurveyFromPortal}
            onOpenProject={handleOpenProject}
            onNavigate={navigatePortal}
          />
        </main>
      )}

      {/* Project picker: nothing project-specific is reachable until one is chosen. */}
      {view === 'modules' && <main className="flex-1 px-4 sm:px-8 py-8 safe-area-content-pb"><ModulePicker onSelect={module => navigatePortal({ module })} /></main>}
      {view === 'qhse' && <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-8 py-6 safe-area-content-pb">
        <QhseHub surveys={surveyList.filter(s => isQhse(s) && s.projectId === activeProject?.id)} project={activeProject} canEdit={mayEditSurveys} canDelete={!isCloudConfigured || mayDeleteSnags} canExport={!isCloudConfigured || mayDownloadReports} onAction={handleQhseAction}
          onReports={() => navigatePortal({ view: 'reports', reportModule: 'qhse' })}
          onBack={handleAppBack} legacySurveys={surveyList.filter(s => s.projectId === activeProject?.id && isLegacyQhse(s) && !isLocked(s))} onMove={handleMoveLegacyQhse} onCreate={startQhse} onOpen={openSurveyFromPortal} />
      </main>}
      {view === 'survey' && isQhse(survey) && <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-6 safe-area-content-pb">
        <QhseInspection project={activeProject} survey={survey} canEdit={mayEditOpen} canDelete={!isCloudConfigured || mayDeleteSnags} canExport={!isCloudConfigured || mayDownloadReports}
          onFacility={handleUpdateFacility} onItem={(item, options) => { if (surveyRef.current?.id !== survey.id) throw new Error('Reopen the original inspection to attach these photos.'); handleUpdateItem(item, options); }} onDelete={handleDeleteItem}
          onAdd={async item => { if (!mayEditOpen) return; if (surveyRef.current?.id !== survey.id) throw new Error('Reopen the original inspection to attach these photos.'); const next = { ...surveyRef.current, items: [...surveyRef.current.items, item] }; surveyRef.current = next; setSurvey(next); await saveSurveyOffline(next); }}
          onSignatures={signatures => { if (mayEditOpen) setSurvey(prev => ({ ...prev, signatures })); }}
          onBack={handleAppBack}
          onAction={handleQhseAction}
          onBackup={handleExportJSON} />
      </main>}
      {view === 'projects' && (
        <main className="flex-1 w-full px-3 sm:px-8 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
          <ProjectDashboard
            key={workModule}
            moduleName={workModule === 'qhse' ? 'QHSE Inspection' : 'Condition Survey'}
            countLabel={workModule === 'qhse' ? 'inspections' : 'facilities'}
            onBack={handleAppBack}
            projects={workModule === 'qhse' ? projects.map(p => ({ ...p, facilityCount: surveyList.filter(s => isQhse(s) && !isDeletedInspection(s) && s.projectId === p.id).length })) : projects}
            deletedProjects={deletedProjects}
            onDeleteProject={mayManageProjects ? p => handleProjectTrash(p, true) : null}
            onRestoreProject={mayManageProjects ? p => handleProjectTrash(p, false) : null}
            loading={projectsLoading}
            online={online}
            onOpenProject={handleOpenProject}
            onCreateProject={mayManageProjects ? handleCreateProject : null}
            onRefresh={refreshProjects}
            openCreateSignal={createProjectSignal}
          />
        </main>
      )}

      {/* Admin-only. The server enforces this regardless of whether this view
          is reachable -- it only decides whether the option is offered. */}
      {view === 'users' && mayManageUsers && (
        <>
          <div className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2">
              <button
                type="button"
                onClick={() => setView('projects')}
                className="text-[12px] font-semibold text-ocs-600 hover:text-ocs-700"
              >
                &larr; Back to Projects
              </button>
            </div>
          </div>
          <main className="flex-1 w-full px-3 sm:px-8 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
            <UserManagement myId={currentUser.id} me={currentUser} projects={projects} />
          </main>
        </>
      )}

      {/* Admin / Developer Dashboard: web portal, administrators only. The
          database refuses configuration, template and user changes from anyone
          else, so these checks only decide what is offered. */}
      {view === 'admin' && mayOpenAdmin(adminModule) && (
        <main className="flex-1 w-full px-3 sm:px-8 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
          <AdminDashboard
            embedded
            module={adminModule}
            onModuleChange={setAdminModule}
            mayOpen={mayOpenAdmin}
            currentUser={currentUser}
            facilities={surveyList}
            projects={projects}
            onConfigPublished={refreshFormsConfig}
          />
        </main>
      )}

      {/* Review & Approval: the queue, the steps, the due dates. */}
      {view === 'review' && mayReview && (
        <>
          <div className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2">
              <Breadcrumb moduleName="Review & Approval" onDashboard={dashboardCrumb} onHome={handleBackToProjects} />
            </div>
          </div>
          <main className="flex-1 w-full px-3 sm:px-5 pt-4 safe-area-content-pb md:pb-8">
            <ReviewApproval
              currentUser={currentUser}
              surveys={listRows}
              projects={projects}
              onOpenSurvey={openSurveyFromPortal}
              onChanged={() => { refreshSurveyList(); refreshProjects(); }}
              onOpenRoles={mayManageUsers ? () => openAdmin('roles') : null}
            />
          </main>
        </>
      )}

      {/* Every facility across projects: where the dashboard's numbers lead. */}
      {view === 'allFacilities' && (
        <>
          <div className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2">
              <Breadcrumb moduleName="All Facilities" onDashboard={dashboardCrumb} onHome={handleBackToProjects} />
            </div>
          </div>
          <main className="flex-1 w-full px-3 sm:px-8 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
            <AllFacilities
              surveys={listRows}
              projects={projects}
              filter={portalListFilter}
              onClearNarrow={() => setPortalListFilter((f) => ({ ...f, priority: null, evidence: null }))}
              currentId={survey?.id}
              onOpen={openSurveyFromPortal}
              onDelete={mayDeleteSnags ? handleDeleteSurvey : null}
              canDownloadReports={mayDownloadReports}
              onRefresh={refreshSurveyList}
              onSyncNow={handleSyncNow}
              onSubmit={handleSubmitFromList}
            />
          </main>
        </>
      )}

      {/* Facilities inside the chosen project. */}
      {view === 'facilities' && activeProject && (
        <>
          <div className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2">
              <Breadcrumb
                project={activeProject}
                onHome={handleBackToProjects}
                onDashboard={dashboardCrumb}
                onProject={() => setView('facilities')}
              />
            </div>
          </div>

          <main className="flex-1 w-full px-3 sm:px-8 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
            <div className="space-y-6">
              <ProjectHero
                project={activeProject}
                facilities={facilitiesInProject}
                onOpenReports={() => setView('reports')}
                onAddFacility={mayEditSurveys ? handleAddFacilityToProject : null}
                onFocusList={(key) => {
                  // The photo count is the one tile with somewhere better to
                  // go than a re-sorted list.
                  if (key === 'photos') { setView('photos'); return; }
                  setListFocus({ key, nonce: Date.now() });
                }}
              />

              {!facilitiesInProject.length && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
                  <h3 className="font-bold text-slate-700 text-sm">No facilities in this project yet</h3>
                  {mayEditSurveys && (
                    <p className="text-xs text-slate-500 mt-1">
                      Use <span className="font-semibold">+ Add Facility</span> to start the first one.
                    </p>
                  )}
                </div>
              )}

              {isCloudConfigured && mayManageTeam && (
                <ProjectTeam project={activeProject} canManage={mayManageTeam} />
              )}

              <SavedFacilities
                surveys={facilitiesInProject}
                currentId={survey?.id}
                onOpen={handleOpenSurvey}
                onDelete={mayDeleteSnags ? handleDeleteSurvey : null}
                canDownloadReports={mayDownloadReports}
                onRefresh={refreshSurveyList}
                onSyncNow={handleSyncNow}
                onSubmit={handleSubmitFromList}
                focus={listFocus}
              />
            </div>
          </main>
        </>
      )}

      {/* Every photo in the project, plus the snags carrying none. */}
      {view === 'photos' && (
        <>
          <div className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2">
              <Breadcrumb
                project={activeProject}
                moduleName="Photos"
                onHome={handleBackToProjects}
                onDashboard={dashboardCrumb}
                onProject={() => setView('facilities')}
              />
            </div>
          </div>
          <main className="flex-1 w-full px-3 sm:px-8 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
            <PhotoGallery
              project={activeProject}
              facilities={facilitiesInProject}
              onOpenFacility={handleOpenSurvey}
            />
          </main>
        </>
      )}

      {/* Report dashboard: pick a project, tick facilities, generate. */}
      {view === 'reports' && (
        <>
          <div className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2">
              <Breadcrumb
                project={activeProject}
                moduleName="Reports"
                onHome={handleBackToProjects}
                onDashboard={dashboardCrumb}
                onProject={() => setView('facilities')}
              />
            </div>
          </div>
          <main className="flex-1 w-full px-3 sm:px-8 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
            <ReportDashboard
              qhseSurveys={surveyList.filter(isQhse)}
              initialModule={workModule}
              onModuleChange={setWorkModule}
              projects={projects}
              surveys={listRows}
              initialProjectId={activeProject?.id || null}
              canDownloadReports={!isCloudConfigured || mayDownloadReports}
            />
          </main>
        </>
      )}

      {/* Main Content Area */}
      {/* Facility bar: which facility is open, switch to another, and submit
          this one when it is finished. */}
      {view === 'survey' && !isQhse(survey) && (
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

          {listRows.length > 0 && (
            <select
              value={survey?.id || ''}
              onChange={(e) => handleOpenSurvey(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-white max-w-[240px] min-w-0 flex-1 sm:flex-none"
              title="Open another facility to view or report on it"
            >
              {!listRows.some((s2) => s2.id === survey?.id) && (
                <option value={survey?.id || ''}>
                  {survey?.facility?.facilityName || 'Current (unsaved)'}
                </option>
              )}
              {listRows.map((s2) => (
                <option key={s2.id} value={s2.id}>
                  {[s2.facility?.facilityCode, s2.facilityName].filter(Boolean).join(' · ')
                    || `Unnamed facility (${s2.itemCount || 0} snag${s2.itemCount === 1 ? '' : 's'})`}
                  {s2.status === 'submitted' ? '  ✓' : '  (draft)'}
                </option>
              ))}
            </select>
          )}

          {mayEditOpen ? (
          <button
            type="button"
            onClick={handleSubmitFacility}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-xs shadow-card transition-[background-color,transform] duration-150 shrink-0"
            title="Save this facility and start a new one"
          >
            <span className="sm:hidden">Submit &amp; New</span>
            <span className="hidden sm:inline">Submit &amp; Start New Facility</span>
          </button>
          ) : (
            <span className="px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold shrink-0"
              title={openIsLocked ? 'Approved facilities are locked' : 'Your role can view this facility but not change it'}>
              {openIsLocked ? 'Locked' : 'Read-only'}
            </span>
          )}
        </div>

        {/* Where this facility is in review, and the steps this person may take. */}
        {workflowReady && openStage && stageOf(openStage) !== 'draft' && (
          <div className="max-w-6xl mx-auto px-3 sm:px-6 pb-2">
            <WorkflowBanner
              stage={stageOf(openStage)}
              note={openStage.reviewNote}
              approvedAt={openStage.approvedAt}
              actions={workflowActions(currentUser, openStage)}
              busy={workflowBusy}
              onStep={handleWorkflowStep}
            />
          </div>
        )}

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
              onDashboard={dashboardCrumb}
              onProject={() => setView('facilities')}
            />
          </div>
        )}
      </div>
      )}

      {showRecoveries && <RecoveryBackups userId={currentUser?.id} onClose={() => setShowRecoveries(false)} />}
      {conflictId === survey?.id && <SyncConflict key={survey.id} survey={survey} onUseServer={useServerAfterRecovery} />}
      {validationIssues.length > 0 && <section role="alert" className="mx-4 my-2 p-4 rounded-xl border border-rose-200 bg-rose-50">
        <h2 className="font-semibold text-rose-900">Complete these fields before submitting. Your draft is kept.</h2>
        <ul className="list-disc pl-5 mt-2 text-sm text-rose-800">{validationIssues.map((issue, index) => <li key={index}>
          <button className="underline py-1" onClick={() => showValidationIssue(issue)}>{issue.label}</button>
        </li>)}</ul>
      </section>}
      {/* Tab panels stay MOUNTED and are hidden with CSS rather than unmounted.
          Conditional rendering meant every tab tap tore down and rebuilt the
          whole subtree -- measured at 1,608 DOM nodes for 8 assets, and ~9,300
          at 50 assets, which is what made switching feel slow. Keeping them
          mounted makes a switch a style change instead of a rebuild, and it
          also preserves each tab's scroll position and in-progress input. */}
      {view === 'survey' && !isQhse(survey) && (
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 safe-area-content-pb md:pb-8">
        {/* A role without Edit surveys sees the facility with every control
            disabled. The database refuses its changes anyway; this keeps the
            screen from offering them. */}
        <TabPanel active={activeTab === 'facility'}>
          <fieldset disabled={!mayEditOpen} className="min-w-0 border-0 p-0 m-0">
          <FacilityInfo
            facility={survey?.facility || {}}
            onChange={handleUpdateFacility}
            onCreate={handleCreateFacility}
            creating={creatingFacility}
            created={!!survey?.cloudRevision}
            onNewFacility={mayEditSurveys ? handleNewFacility : null}
            templates={templates}
            canStartFromTemplate={
              !survey?.facility?.templateId && (survey?.items || []).every(isBlankSnag)
            }
          />
          </fieldset>
        </TabPanel>

        <TabPanel active={activeTab === 'items'}>
          <fieldset disabled={!mayEditOpen} className="min-w-0 border-0 p-0 m-0">
          <SurveyList
            items={survey?.items || []}
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            canDelete={mayDeleteSnags}
            templates={templates}
            facilityType={survey?.facility?.facilityType || ''}
            appliedTemplateName={survey?.facility?.templateName || ''}
            onApplyTemplate={handleApplyTemplate}
          />
          </fieldset>
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
              surveys={listRows}
              currentId={survey?.id}
              onOpen={handleOpenSurvey}
              onDelete={mayDeleteSnags ? handleDeleteSurvey : null}
              canDownloadReports={mayDownloadReports}
              onRefresh={refreshSurveyList}
              onSyncNow={handleSyncNow}
              onSubmit={handleSubmitFromList}
            />
          </div>
          <fieldset disabled={!mayEditOpen} className="min-w-0 border-0 p-0 m-0">
          <SignatureSection
            signatures={survey?.signatures || {}}
            onChange={handleUpdateSignatures}
            facility={survey?.facility || {}}
            onOpenReport={() => setShowReportModal(true)}
          />
          </fieldset>
        </TabPanel>
      </main>
      )}

      {workModule && ['projects', 'qhse', 'facilities', 'reports'].includes(view) && <WorkspaceBottomNav
        view={view}
        onProjects={() => navigatePortal({ module: workModule })}
        onReports={() => navigatePortal({ view: 'reports', reportModule: workModule })}
        onMore={() => setNavOpen(true)}
      />}
      {/* Audit Report Modal & PDF Generation Engine */}
      {showReportModal && (
        <ReportModal
          survey={survey || {}}
          onClose={() => setShowReportModal(false)}
          canDownloadReports={mayDownloadReports}
        />
      )}
      </div>
    </div>
    </Suspense>
    </SubmissionValidation.Provider>
  );
}
