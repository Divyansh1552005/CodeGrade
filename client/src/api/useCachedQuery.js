import { useCallback, useEffect, useState } from 'react';
import { api } from './client.js';

// Tiny module-level cache so revisiting a route serves data instantly and then
// revalidates in the background (a minimal SWR-style pattern, no extra deps).
const cache = new Map();

export function invalidate(key) {
  if (key) cache.delete(key);
  else cache.clear();
}

/**
 * Fetch `url` with GET and cache the result by key (default: the url).
 * Returns { data, loading, error, refetch }.
 */
export function useCachedQuery(url, { key = url, enabled = true } = {}) {
  const [data, setData] = useState(() => cache.get(key));
  const [loading, setLoading] = useState(enabled && !cache.has(key));
  const [error, setError] = useState('');

  const run = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled) return;
      if (!force && cache.has(key)) {
        setData(cache.get(key));
      } else {
        setLoading(true);
      }
      try {
        const res = await api.get(url);
        cache.set(key, res.data);
        setData(res.data);
        setError('');
      } catch (err) {
        setError(err.response?.data?.error || 'Request failed');
      } finally {
        setLoading(false);
      }
    },
    [url, key, enabled]
  );

  useEffect(() => {
    run();
  }, [run]);

  const refetch = useCallback(() => run({ force: true }), [run]);

  return { data, loading, error, refetch };
}
