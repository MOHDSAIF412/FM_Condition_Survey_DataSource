import React from 'react';
import {
  LayoutList, GitBranch, FileText, Users, ShieldCheck, ClipboardList, Workflow, Settings, History, Sparkles, Lock, ScrollText
} from 'lucide-react';
import FormBuilder from './FormBuilder';
import AuditLog from './AuditLog';
import UserManagement from '../components/UserManagement';
import TemplateManager from '../components/TemplateManager';

/**
 * The Admin / Developer Dashboard. Web portal only, administrators only.
 *
 * Modules are built in stages; the ones not built yet are listed as such
 * rather than hidden or faked, so it is always clear what the dashboard can
 * and cannot do today.
 */
export const ADMIN_MODULES = [
  { key: 'forms', label: 'Forms & Fields', hint: 'Sections, fields, dropdown options', icon: LayoutList, ready: true },
  { key: 'rules', label: 'Conditional Rules', hint: 'IF / THEN show, hide, require', icon: GitBranch, ready: false, stage: 'Next stage' },
  { key: 'reports', label: 'Report Builder', hint: 'Columns, photos, headers', icon: FileText, ready: false, stage: 'Stage 4' },
  { key: 'users', label: 'Users', hint: 'Add, disable, reset passwords', icon: Users, ready: true },
  { key: 'roles', label: 'Roles & Permissions', hint: 'Roles, projects, backend rules', icon: ShieldCheck, ready: false, stage: 'Stage 5' },
  { key: 'templates', label: 'Inspection Templates', hint: 'Standard checklists', icon: ClipboardList, ready: true },
  { key: 'workflows', label: 'Workflows', hint: 'Status stages and approvals', icon: Workflow, ready: false, stage: 'Stage 6' },
  { key: 'settings', label: 'Settings', hint: 'Application settings', icon: Settings, ready: false, stage: 'Later stage' },
  { key: 'versions', label: 'Version History', hint: 'Published versions, rollback', icon: History, ready: true },
  { key: 'audit', label: 'Audit Log', hint: 'Who changed what, and when', icon: ScrollText, ready: true },
  { key: 'ai', label: 'AI Assistant', hint: 'Not enabled', icon: Sparkles, ready: false, stage: 'Not enabled' }
];

export default function AdminDashboard({ module = 'forms', onModuleChange, currentUser, facilities, projects, onConfigPublished, embedded = false }) {
  const active = ADMIN_MODULES.find((m) => m.key === module && m.ready) || ADMIN_MODULES[0];

  return (
    <div className={`max-w-7xl mx-auto grid gap-5 ${embedded ? '' : 'lg:grid-cols-[240px_1fr]'}`}>
      {/* Inside the web portal the main sidebar lists these modules already. */}
      {!embedded && <nav aria-label="Admin modules" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 self-start lg:sticky lg:top-4">
        <p className="px-3 pt-2 pb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Admin Dashboard</p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
          {ADMIN_MODULES.map((m) => {
            const Icon = m.icon;
            const isActive = m.key === active.key;
            return (
              <li key={m.key}>
                <button
                  type="button"
                  disabled={!m.ready}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onModuleChange(m.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-start gap-2.5 transition-colors ${
                    isActive ? 'bg-ocs-600 text-white' : m.ready ? 'text-slate-700 hover:bg-slate-50' : 'text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{m.label}</span>
                    <span className={`block text-[11px] truncate ${isActive ? 'text-sky-100' : 'text-slate-400'}`}>
                      {m.ready ? m.hint : (
                        <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> {m.stage}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>}

      <section aria-label={active.label} className="min-w-0">
        {active.key === 'forms' && <FormBuilder key="forms" onPublished={onConfigPublished} />}
        {active.key === 'versions' && <FormBuilder key="versions" onPublished={onConfigPublished} openHistory />}
        {active.key === 'users' && <UserManagement myId={currentUser?.id} />}
        {active.key === 'templates' && <TemplateManager facilities={facilities} projects={projects} />}
        {active.key === 'audit' && <AuditLog />}
      </section>
    </div>
  );
}
