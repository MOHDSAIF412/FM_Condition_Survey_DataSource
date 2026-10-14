import { useCallback, useLayoutEffect, useRef } from 'react';

// Memoized children keep handler identities while receiving committed updates.
export function useStableEvent(handler) {
  const latest = useRef(handler);
  useLayoutEffect(() => { latest.current = handler; }, [handler]);
  return useCallback((...args) => latest.current?.(...args), []);
}
