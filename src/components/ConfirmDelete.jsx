import React, { useEffect, useRef } from 'react';

export default function ConfirmDelete({ title, children, onCancel, onConfirm }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    return () => previous?.focus?.();
  }, []);
  return <div className="fixed inset-0 z-[100] bg-slate-900/40 flex items-center justify-center p-4" onClick={onCancel}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4" onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Tab') {
        const buttons = dialog.current.querySelectorAll('button');
        if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[buttons.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0].focus(); }
      }
    }}><h2 className="text-xl font-bold text-[#293771]">{title}</h2><p className="text-sm text-slate-600">{children}</p><div className="flex justify-end gap-3"><button className="min-h-11 rounded-lg border px-4 py-2" onClick={onCancel}>Cancel</button><button className="min-h-11 rounded-lg bg-red-700 text-white px-4 py-2 font-semibold" onClick={onConfirm}>Confirm delete</button></div></div>
  </div>;
}
