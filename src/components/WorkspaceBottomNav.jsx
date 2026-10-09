import React from 'react';
import { FolderKanban, FileText, Menu } from 'lucide-react';

export default function WorkspaceBottomNav({ view, onProjects, onReports, onMore }) {
  return <nav aria-label="Workspace shortcuts" className="mobile-bottom-nav fixed bottom-0 inset-x-0 z-30 md:hidden safe-area-pb">
    <div className="grid grid-cols-3 max-w-lg mx-auto px-3 pt-2">
      {[
        ['Projects', FolderKanban, ['projects', 'qhse', 'facilities'].includes(view), onProjects],
        ['Reports', FileText, view === 'reports', onReports],
        ['More', Menu, false, onMore]
      ].map(([label, Icon, active, action]) => <button type="button" key={label} onClick={action}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium ${active ? 'text-ocs-600 bg-ocs-50' : 'text-slate-500'}`}>
        <Icon size={21} strokeWidth={active ? 2.2 : 1.8} /><span>{label}</span>
      </button>)}
    </div>
  </nav>;
}
