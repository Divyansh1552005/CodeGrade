import { useCallback, useEffect, useState } from 'react';

/** A countdown in whole seconds. `start(n)` begins counting down from n; `remaining` is 0 when it is done. */
export function useCooldown(initial = 0) {
  const [remaining, setRemaining] = useState(initial);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setTimeout(() => setRemaining((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  const start = useCallback((seconds) => setRemaining(seconds), []);
  return { remaining, start };
}
