import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client.js';

const PAGE_LIMIT = 20;

/**
 * Cursor-paginated GET, backed by the `limit`/`cursor`/`nextCursor`/`hasMore`
 * contract on /problems and /doubts. `baseUrl` may already carry its own
 * query string (e.g. `?topics=a,b`) — changing it resets to page one.
 */
export function usePaginatedQuery(baseUrl, itemsKey) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(
    async ({ cursor: after, append = false } = {}) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const sep = baseUrl.includes('?') ? '&' : '?';
        const url = `${baseUrl}${sep}limit=${PAGE_LIMIT}${
          after ? `&cursor=${encodeURIComponent(after)}` : ''
        }`;
        const { data } = await api.get(url);
        if (id !== requestId.current) return; // stale response, a newer load superseded it
        setItems((prev) => (append ? [...prev, ...data[itemsKey]] : data[itemsKey]));
        setCursor(data.nextCursor || null);
        setHasMore(Boolean(data.hasMore));
        setError('');
      } catch (err) {
        if (id !== requestId.current) return;
        if (err.response?.status === 400 && after) {
          // The cursor was rejected (invalid or expired): start again from the first page.
          setCursor(null);
          load();
          return;
        }
        setError(err.response?.data?.error || 'Request failed');
      } finally {
        if (id !== requestId.current) return;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [baseUrl, itemsKey]
  );

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(() => {
    if (cursor && !loadingMore) load({ cursor, append: true });
  }, [cursor, loadingMore, load]);

  const refetch = useCallback(() => load(), [load]);

  return { items, loading, loadingMore, hasMore, error, loadMore, refetch };
}
