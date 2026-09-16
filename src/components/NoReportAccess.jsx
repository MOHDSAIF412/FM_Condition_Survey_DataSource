import React from 'react';
import { Lock } from 'lucide-react';

/**
 * Shown where report downloads would be, for someone without the permission,
 * so a missing button reads as a decision rather than a fault.
 */
export default function NoReportAccess({ className = '' }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold ${className}`}
    >
      <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        Downloading client reports needs permission. Ask an administrator to grant
        “Download reports” in Manage Users.
      </span>
    </div>
  );
}
