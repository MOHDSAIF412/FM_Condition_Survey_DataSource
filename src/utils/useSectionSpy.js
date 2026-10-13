import { useEffect } from 'react';

// Keeps a sticky section switcher in step with scrolling: the active section
// is the last one whose top has passed under the header and switcher.
export function useSectionSpy(refs, onChange, offset = 160) {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = Object.keys(refs)[0];
      for (const [key, ref] of Object.entries(refs)) {
        if (ref.current && ref.current.getBoundingClientRect().top <= offset) current = key;
      }
      // At the very bottom the last section may never reach the top; count it as reached.
      const keys = Object.keys(refs);
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = keys[keys.length - 1];
      onChange(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
