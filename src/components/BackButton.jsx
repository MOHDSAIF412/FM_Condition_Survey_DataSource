import React from 'react';
import { ChevronLeft } from 'lucide-react';

// Quiet by design: it sits above every screen, so it must not compete with
// the screen's own primary action. The tap target stays 44px tall.
export default function BackButton({ onClick, children, disabled = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="group inline-flex items-center gap-1 min-h-11 -ml-2 pl-1.5 pr-3 rounded-xl text-ocs-600 text-sm font-semibold hover:bg-ocs-50 active:bg-ocs-100 transition-colors disabled:opacity-50"><ChevronLeft className="w-5 h-5 shrink-0 transition-transform group-hover:-translate-x-0.5" /><span>{children || 'Back'}</span></button>;
}
