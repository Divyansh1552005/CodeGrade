import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { api } from './client.js';

/**
 * One cursor-paged list with Older / Newer / Newest controls.
 *
 * - The current cursor lives in the URL (`param`, so a refresh and the back button work, and two lists
 *   on a page keep separate cursors). With `syncUrl: false` it lives in state instead.
 * - The cursors of the pages already visited are kept in a stack in state. After a refresh the stack is
 *   empty, so Newer is unavailable and Newest returns to the first page.
 * - The previous rows stay in `items` while the next page loads (`fetching`), so nothing jumps.
 * - A new request aborts the previous one, and a late response is ignored.
 * - A 400 for a cursor (expired or invalid) resets the list to its first page.
 * - `pollMs` refreshes the FIRST page only, quietly, while the tab is visible. On an older page nothing
 *   polls, so the rows being read never shift. Rows are keyed by id, so expanded rows keep their state.
 *
 * Everything it holds is scoped to `url`: when `url` changes (another problem's list) the old rows, cursor
 * and stack are dropped at once, so rows from the previous url are never shown.
 * `pollWhen(items)` limits polling to moments it returns true (for example while a submission is pending).
 */
export function usePagedList({ url, itemsKey, limit = 10, param = 'page', syncUrl = true, enabled = true, pollMs = 0, pollWhen }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // State is stored with the url it belongs to and ignored once the url changes.
  const [cursorBox, setCursorBox] = useState({ url, value: null });
  const [stackBox, setStackBox] = useState({ url, items: [] }); // cursors of the pages newer than this one
  const [dataBox, setDataBox] = useState(null); // { url, items, nextCursor, hasMore, meta } of the last good response
  const cursor = syncUrl ? searchParams.get(param) : (cursorBox.url === url ? cursorBox.value : null);
  const stack = stackBox.url === url ? stackBox.items : [];
  const data = dataBox && dataBox.url === url ? dataBox : null;
  const setStateCursor = useCallback((value) => setCursorBox({ url, value }), [url]);
  const setStack = useCallback((update) => setStackBox((previous) => {
    const base = previous.url === url ? previous.items : [];
    return { url, items: typeof update === 'function' ? update(base) : update };
  }), [url]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const controller = useRef(null);
  const sequence = useRef(0);
  const userRequest = useRef(false);
  const expected = useRef(undefined); // the cursor our own navigation is about to set

  const setCursor = useCallback((next, { replace = false } = {}) => {
    if (!syncUrl) { setStateCursor(next); return; }
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next) params.set(param, next); else params.delete(param);
      return params;
    }, { replace });
  }, [syncUrl, param, setSearchParams, setStateCursor]);

  const fetchPage = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) return;
    if (silent && userRequest.current) return; // never poll over a page the user asked for
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    const id = ++sequence.current;
    if (!silent) { userRequest.current = true; setFetching(true); setError(''); }
    try {
      const sep = url.includes('?') ? '&' : '?';
      const { data: body } = await api.get(`${url}${sep}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: ctl.signal });
      if (id !== sequence.current) return;
      const { [itemsKey]: items, nextCursor, hasMore, ...meta } = body;
      setDataBox({ url, items: items ?? [], nextCursor: nextCursor ?? null, hasMore: Boolean(hasMore), meta });
      setError('');
    } catch (err) {
      if (axios.isCancel(err) || id !== sequence.current) return;
      if (err.response?.status === 400 && cursor) {
        // The cursor was rejected (invalid or expired): start again from the first page.
        expected.current = undefined;
        setCursor(null, { replace: true });
        return;
      }
      if (!silent) setError(err.response?.data?.error || 'Could not load this list. Check your connection and try again.');
    } finally {
      if (id === sequence.current && !silent) { userRequest.current = false; setFetching(false); }
    }
  }, [url, itemsKey, limit, cursor, enabled, setCursor]);

  useEffect(() => {
    fetchPage();
    return () => { controller.current?.abort(); userRequest.current = false; };
  }, [fetchPage, reloadKey]);

  // Keep the stack honest when the URL changes under us (back, forward, an edited link).
  useEffect(() => {
    if (expected.current !== undefined && expected.current === cursor) { expected.current = undefined; return; }
    expected.current = undefined;
    setStack((previous) => {
      const index = previous.lastIndexOf(cursor);
      return index >= 0 ? previous.slice(0, index) : [];
    });
  }, [cursor, setStack]);

  useEffect(() => {
    if (!enabled || !pollMs || cursor || (pollWhen && !pollWhen(data?.items ?? []))) return undefined;
    const tick = () => { if (!document.hidden) fetchPage({ silent: true }); };
    const timer = setInterval(tick, pollMs);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [enabled, pollMs, cursor, fetchPage, pollWhen, data]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);
  const goOlder = useCallback(() => {
    if (!data?.hasMore || !data.nextCursor || fetching) return;
    setStack((previous) => [...previous, cursor ?? null]);
    expected.current = data.nextCursor;
    setCursor(data.nextCursor);
  }, [data, fetching, cursor, setCursor, setStack]);
  const goNewer = useCallback(() => {
    if (!stack.length || fetching) return;
    const previous = stack[stack.length - 1];
    setStack(stack.slice(0, -1));
    expected.current = previous;
    setCursor(previous);
  }, [stack, fetching, setCursor, setStack]);
  const goNewest = useCallback(() => {
    if (fetching) return;
    if (!cursor) { reload(); return; }
    setStack([]);
    expected.current = null;
    setCursor(null);
  }, [fetching, cursor, setCursor, reload, setStack]);

  return {
    items: data?.items ?? [],
    meta: data?.meta ?? {},
    hasMore: Boolean(data?.hasMore),
    loading: !data && fetching, // the very first load: show skeleton rows
    fetching, // any request the user asked for in flight: keep the rows, disable the controls
    error,
    isFirstPage: !cursor,
    canOlder: Boolean(data?.hasMore) && !fetching,
    canNewer: stack.length > 0 && !fetching,
    canNewest: Boolean(cursor) && !fetching,
    goOlder, goNewer, goNewest, reload,
    retry: reload,
  };
}
