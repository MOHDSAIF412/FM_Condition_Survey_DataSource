import React, { useState } from 'react';
import { roleLabel as labelForRole, isAdminUser } from '../utils/roles';
import { can } from '../utils/auth';
import {
  Download,
  Upload,
  RotateCcw,
  FileText,
  CheckCircle2,
  ChevronDown,
  Users,
  LogOut,
  KeyRound,
  Bell,
  Menu,
  User,
} from 'lucide-react';

const MENU_ITEM = 'w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 flex items-center gap-2';
const MENU_HEADING = 'px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400';

/**
 * Top bar: white surface, app title with its current context, connectivity,
 * notifications, and the account menu.
 *
 * The OCS mark lives in the sidebar on desktop, so it only appears here on
 * narrow screens where there is no sidebar to carry it.
 */
export default function Header({
  survey,
  onReset,
  onOpenReport,
  onExportJSON,
  onImportJSON,
  onExportExcel,
  lastSaved,
  syncState = 'off',
  online = true,
  pendingCount = 0,
  currentUser = null,
  contextLabel = '',
  showReports = true,
  onOpenUsers,
  onOpenNav,
  searchSlot,
  onChangePassword,
  onSignOut,
  canDownloadReports = true,
  canEdit = true
}) {
  // Connectivity wins over sync state: if there is no connection, saying
  // "Synced" would be a lie even when the last push did succeed.
  // A refused session is reported even while offline: it is the reason nothing
  // will upload, and it does not resolve by finding signal.
  const sync = (!online && syncState !== 'unauthorized' && syncState !== 'refused')
    ? { label: pendingCount > 0 ? `Offline - ${pendingCount} waiting` : 'Offline',
        cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' }
    : ({
        off:     { label: 'Offline Ready',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
        idle:    { label: 'Online',           cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
        syncing: { label: pendingCount > 0 ? `Syncing ${pendingCount}...` : 'Syncing...',
                   cls: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
        synced:  { label: 'All data synced',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
        offline: { label: 'Waiting to sync',  cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
        // Distinct from "waiting": nothing will ever upload until they sign in
        // again, so this must not look like a patchy connection.
        unauthorized: { label: 'Sign in again to sync',
                        cls: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
        // Signed in, but the role or project team does not allow the upload.
        refused: { label: 'No upload access',
                   cls: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' }
      }[syncState] || { label: 'Online', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' });

  const [showMenu, setShowMenu] = useState(false);
  const [showBell, setShowBell] = useState(false);

  const displayName = currentUser?.full_name || currentUser?.email || 'Signed in';
  const roleLabel = currentUser ? labelForRole(currentUser) : 'FM Team';

  const subtitle = contextLabel
    || survey?.facility?.facilityName
    || survey?.facility?.buildingName
    || 'New Facility Assessment';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 safe-area-pt">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">

        {/* Web portal: menu button (narrow screens) and search. The sidebar
            carries the logo and title on wide screens, so they step aside. */}
        {onOpenNav && (
          <button type="button" onClick={onOpenNav} aria-label="Open menu"
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 shrink-0">
            <Menu className="w-5 h-5" />
          </button>
        )}
        {searchSlot && <div className="hidden md:flex flex-1 min-w-0 max-w-xl">{searchSlot}</div>}

        {/* Left: title + current context */}
        <div className={`flex items-center gap-3 min-w-0 ${searchSlot ? 'md:hidden' : ''}`}>
          {/* Only on narrow screens -- the sidebar carries the mark on desktop. */}
          <img
            src="/ocs-logo.png"
            alt="OCS"
            className="h-7 w-auto shrink-0 pr-3 border-r border-slate-200 lg:hidden"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate">
                FM Condition Survey
              </h1>
              <span className={`hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${sync.cls}`}>
                <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full mr-1.5 ${sync.dot}`} />
                {sync.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate max-w-[180px] sm:max-w-sm">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right: reports, notifications, account */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {searchSlot && (
            <span className={`hidden md:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${sync.cls}`}>
              <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full mr-1.5 ${sync.dot}`} />
              {sync.label}
            </span>
          )}
          {showReports && (
            <button
              onClick={onOpenReport}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-flame-500 hover:bg-flame-600 active:scale-[0.97] text-white font-semibold text-xs sm:text-sm shadow-card transition-[background-color,transform] duration-150"
            >
              <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="sm:hidden">Report</span>
              {/* Only promise downloads to someone who can make them. */}
              <span className="hidden sm:inline">
                {canDownloadReports ? 'Reports (PDF/Excel)' : 'View Report'}
              </span>
            </button>
          )}

          {/* Notifications: the badge is the real count of work still waiting
              to reach the server, not a decorative number. */}
          <div className="relative">
            <button
              onClick={() => { setShowBell((v) => !v); setShowMenu(false); }}
              className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
              title="Sync status"
            >
              <Bell className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>

            {showBell && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowBell(false)} />
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-3 px-4 z-50">
                  <p className="text-xs font-bold text-slate-700 mb-1">Sync status</p>
                  <p className="text-xs text-slate-600 flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${sync.dot}`} />
                    {sync.label}
                  </p>
                  {pendingCount > 0 && (
                    <p className="text-xs text-amber-700 mt-1.5">
                      {pendingCount} item{pendingCount === 1 ? '' : 's'} still to upload. They send
                      automatically when there is a connection.
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Saved on device {lastSaved ? `(${lastSaved})` : ''}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="hidden sm:block w-px h-8 bg-slate-200" />

          {/* Account */}
          <div className="relative">
            <button
              onClick={() => { setShowMenu(!showMenu); setShowBell(false); }}
              className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <span className="w-9 h-9 rounded-full bg-ocs-600 text-white flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </span>
              <span className="hidden sm:block text-left leading-tight">
                <span className="block text-sm font-bold text-slate-900 max-w-[140px] truncate">
                  {displayName}
                </span>
                <span className="block text-[11px] text-slate-500">{roleLabel}</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                {/* Grouped under headings rather than one flat list. The
                    destructive "clear survey" used to sit between backup and
                    Manage Users, a thumb's width from things used daily; it now
                    lives on its own at the bottom, below everything routine. */}
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 text-slate-700 max-h-[80vh] overflow-y-auto">
                  {currentUser && (
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
                      <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                      <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        isAdminUser(currentUser)
                          ? 'bg-ocs-50 text-ocs-700 border-ocs-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {labelForRole(currentUser)}
                      </span>
                    </div>
                  )}

                  <p className={MENU_HEADING}>This facility</p>

                  {canDownloadReports && (
                    <button
                      onClick={() => { setShowMenu(false); if (onExportExcel) onExportExcel(); }}
                      className={MENU_ITEM + ' text-emerald-700 font-medium'}
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Excel Report (.xlsx)</span>
                    </button>
                  )}

                  <button
                    onClick={() => { setShowMenu(false); onExportJSON(); }}
                    className={MENU_ITEM}
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                    <span>Backup Survey (JSON)</span>
                  </button>

                  {canEdit && <label className={MENU_ITEM + ' cursor-pointer'}>
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span>Restore Survey (JSON)</span>
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => { setShowMenu(false); onImportJSON(e); }}
                    />
                  </label>}

                  {currentUser && can(currentUser, 'manage_users') && onOpenUsers && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <p className={MENU_HEADING}>Administration</p>
                      <button
                        onClick={() => { setShowMenu(false); onOpenUsers(); }}
                        className={MENU_ITEM}
                      >
                        <Users className="w-4 h-4 text-slate-400" />
                        <span>Manage Users &amp; Access</span>
                      </button>
                    </>
                  )}

                  {currentUser && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <p className={MENU_HEADING}>Account</p>

                      {onChangePassword && (
                        <button
                          onClick={() => { setShowMenu(false); onChangePassword(); }}
                          className={MENU_ITEM}
                        >
                          <KeyRound className="w-4 h-4 text-slate-400" />
                          <span>Change Password</span>
                        </button>
                      )}

                      {onSignOut && (
                        <button
                          onClick={() => { setShowMenu(false); onSignOut(); }}
                          className={MENU_ITEM}
                        >
                          <LogOut className="w-4 h-4 text-slate-400" />
                          <span>Sign Out</span>
                        </button>
                      )}
                    </>
                  )}

                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <p className={MENU_HEADING + ' text-rose-400'}>Careful</p>
                    <button
                      onClick={() => { setShowMenu(false); onReset(); }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-rose-50 text-rose-600 flex items-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Start Fresh / Clear Survey</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
