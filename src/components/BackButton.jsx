import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ onClick, children, disabled = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 min-h-11 px-4 py-2 rounded-xl border border-slate-200 bg-white text-[#293771] text-sm font-semibold shadow-sm hover:bg-blue-50 disabled:opacity-50"><ArrowLeft className="w-4 h-4 shrink-0" /><span>{children || 'Back'}</span></button>;
}
