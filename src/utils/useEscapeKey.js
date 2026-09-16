import { useEffect, useRef } from 'react';

/** Calls `onEscape` when Escape is pressed while `active`. For closing dialogs. */
export function useEscapeKey(onEscape, active = true) {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') handler.current?.(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
