import { useLayoutEffect, useRef } from 'react';

// Remember where the user was in each screen during this app session.
// Passive observation avoids extra React renders while scrolling.
export function useScreenScroll(key, ready = true) {
  const positions = useRef(new Map());
  useLayoutEffect(() => {
    if (!ready) return;
    window.scrollTo({ top: positions.current.get(key) || 0, behavior: 'instant' });
    const remember = () => {
      positions.current.set(key, window.scrollY);
      if (positions.current.size > 40) positions.current.delete(positions.current.keys().next().value);
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [key, ready]);
}
