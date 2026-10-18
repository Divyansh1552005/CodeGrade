import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client.js';

// Tiny module-level cache so revisiting a route serves data instantly and then
// revalidates in the background (a minimal SWR-style pattern, no extra deps).
const cache = new Map();
let cacheVersion = 0;

export function invalidate(key) {
  cacheVersion += 1;
  if (key) cache.delete(key);
  else cache.clear();
}

/**
 * Fetch `url` with GET and cache the result by key (default: the url).
 * Returns { data, loading, error, refetch }.
 */
export function useCachedQuery(url, { key = url, enabled = true, refetchInterval = 0, pauseWhenHidden = false } = {}) {
  const [data, setData] = useState(() => cache.get(key));
  const [loading, setLoading] = useState(enabled && !cache.has(key));
  const [error, setError] = useState('');
  const generation = useRef(0);
  const inFlight = useRef(false);

  const run = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled || inFlight.current) return;
      inFlight.current = true;
      const current = generation.current;
      const version = cacheVersion;
      if (!force && cache.has(key)) {
        setData(cache.get(key));
      } else {
        setLoading(true);
      }
      try {
        const res = await api.get(url);
        if (current !== generation.current) return;
        if (version === cacheVersion) cache.set(key, res.data);
        setData(res.data);
        setError('');
      } catch (err) {
        if (current !== generation.current) return;
        setError(err.response?.data?.error || 'Request failed');
      } finally {
        if (current === generation.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [url, key, enabled]
  );

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    setData(cache.get(key));
    setError('');
    setLoading(enabled && !cache.has(key));
    run();
    return () => { generation.current += 1; };
  }, [run, key, enabled]);

  // With `pauseWhenHidden`, polling stops while the tab is in the background and the query
  // refreshes once as soon as the tab is visible again.
  useEffect(() => {
    if (!enabled || !refetchInterval) return undefined;
    const hidden = () => pauseWhenHidden && typeof document !== 'undefined' && document.hidden;
    const timer = setInterval(() => { if (!hidden()) run(); }, refetchInterval);
    const onVisible = () => { if (!hidden()) run(); };
    if (pauseWhenHidden) document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      if (pauseWhenHidden) document.removeEventListener('visibilitychange', onVisible);
    };
  }, [run, enabled, refetchInterval, pauseWhenHidden]);

  const refetch = useCallback(() => run({ force: true }), [run]);

  return { data, loading, error, refetch };
}
