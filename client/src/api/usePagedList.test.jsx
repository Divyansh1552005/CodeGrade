import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import axios from 'axios';
import { usePagedList } from './usePagedList.js';
import { api } from './client.js';

vi.mock('./client.js', () => ({ api: { get: vi.fn() } }));

const page = (ids, nextCursor = null) => ({ data: { submissions: ids.map((id) => ({ _id: id })), nextCursor, hasMore: Boolean(nextCursor), total: 99 } });
const ids = (result) => result.current.list.items.map((i) => i._id);
const wrapper = (initial = '/profile') => ({ children }) => <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
function setup(options = {}, initial) {
  return renderHook(() => ({
    list: usePagedList({ url: '/submissions', itemsKey: 'submissions', param: 'sub', ...options }),
    location: useLocation(),
  }), { wrapper: wrapper(initial) });
}
const requestedUrls = () => api.get.mock.calls.map(([url]) => url);

// A block body: vitest calls a function returned from beforeEach as cleanup, and mockReset returns the mock.
beforeEach(() => { api.get.mockReset(); });
afterEach(() => { vi.useRealTimers(); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });

it('loads the first page with the limit, and exposes the rows and extra fields', async () => {
  api.get.mockResolvedValue(page(['a', 'b'], 'c1'));
  const { result } = setup();
  expect(result.current.list.loading).toBe(true);
  await waitFor(() => expect(ids(result)).toEqual(['a', 'b']));
  expect(requestedUrls()).toEqual(['/submissions?limit=10']);
  expect(result.current.list).toMatchObject({ loading: false, fetching: false, hasMore: true, canOlder: true, canNewer: false, canNewest: false, isFirstPage: true });
  expect(result.current.list.meta).toEqual({ total: 99 });
});
it('goes Older with the cursor in the URL, Newer back through the stack, and Newest to the first page', async () => {
  api.get.mockImplementation(async (url) => (url.includes('cursor=c2') ? page(['e'], null) : url.includes('cursor=c1') ? page(['c', 'd'], 'c2') : page(['a', 'b'], 'c1')));
  const { result } = setup();
  await waitFor(() => expect(ids(result)).toEqual(['a', 'b']));
  act(() => result.current.list.goOlder());
  await waitFor(() => expect(ids(result)).toEqual(['c', 'd']));
  expect(result.current.location.search).toBe('?sub=c1');
  expect(result.current.list).toMatchObject({ canNewer: true, canNewest: true, canOlder: true, isFirstPage: false });
  act(() => result.current.list.goOlder());
  await waitFor(() => expect(ids(result)).toEqual(['e']));
  expect(result.current.list.canOlder).toBe(false);
  act(() => result.current.list.goNewer());
  await waitFor(() => expect(ids(result)).toEqual(['c', 'd']));
  expect(result.current.location.search).toBe('?sub=c1');
  act(() => result.current.list.goNewer());
  await waitFor(() => expect(ids(result)).toEqual(['a', 'b']));
  expect(result.current.location.search).toBe('');
  act(() => result.current.list.goOlder());
  await waitFor(() => expect(ids(result)).toEqual(['c', 'd']));
  act(() => result.current.list.goNewest());
  await waitFor(() => expect(ids(result)).toEqual(['a', 'b']));
  expect(result.current.location.search).toBe('');
  expect(result.current.list.canNewer).toBe(false);
});
it('after a refresh (a cursor in the URL and no history) Newer is unavailable and Newest returns to page one', async () => {
  api.get.mockImplementation(async (url) => (url.includes('cursor=c1') ? page(['c'], null) : page(['a'], 'c1')));
  const { result } = setup({}, '/profile?sub=c1');
  await waitFor(() => expect(ids(result)).toEqual(['c']));
  expect(requestedUrls()[0]).toBe('/submissions?limit=10&cursor=c1');
  expect(result.current.list).toMatchObject({ canNewer: false, canNewest: true, isFirstPage: false });
  act(() => result.current.list.goNewest());
  await waitFor(() => expect(ids(result)).toEqual(['a']));
  expect(result.current.location.search).toBe('');
});
it('keeps two lists independent: moving one leaves the other\'s cursor in the URL alone', async () => {
  api.get.mockResolvedValue(page(['x'], 'next'));
  const { result } = renderHook(() => ({
    subs: usePagedList({ url: '/submissions', itemsKey: 'submissions', param: 'sub' }),
    doubts: usePagedList({ url: '/doubts', itemsKey: 'submissions', param: 'dbt' }),
    location: useLocation(),
  }), { wrapper: wrapper('/profile?dbt=keep') });
  await waitFor(() => expect(result.current.subs.items).toHaveLength(1));
  act(() => result.current.subs.goOlder());
  await waitFor(() => expect(result.current.location.search).toContain('sub=next'));
  expect(result.current.location.search).toContain('dbt=keep');
  expect(requestedUrls().filter((u) => u.startsWith('/doubts')).every((u) => u.endsWith('cursor=keep'))).toBe(true);
});
it('keeps the previous rows while the next page loads and disables the controls', async () => {
  let resolve;
  api.get.mockResolvedValueOnce(page(['a', 'b'], 'c1')).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const { result } = setup();
  await waitFor(() => expect(ids(result)).toEqual(['a', 'b']));
  act(() => result.current.list.goOlder());
  await waitFor(() => expect(result.current.list.fetching).toBe(true));
  expect(ids(result)).toEqual(['a', 'b']);
  expect(result.current.list).toMatchObject({ loading: false, canOlder: false, canNewer: false, canNewest: false });
  act(() => result.current.list.goOlder()); // ignored while in flight
  expect(api.get).toHaveBeenCalledTimes(2);
  await act(async () => { resolve(page(['c'], null)); });
  await waitFor(() => expect(ids(result)).toEqual(['c']));
});
it('aborts the previous request and ignores a late response when another request starts', async () => {
  const signals = [];
  const resolvers = [];
  api.get.mockImplementation((url, config) => { signals.push(config.signal); return new Promise((resolve) => resolvers.push(resolve)); });
  const { result } = setup({}, '/profile?sub=old');
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  act(() => result.current.list.reload()); // a second request starts before the first response
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(signals[0].aborted).toBe(true);
  await act(async () => { resolvers[1](page(['fresh'], null)); });
  await waitFor(() => expect(ids(result)).toEqual(['fresh']));
  await act(async () => { resolvers[0](page(['stale'], null)); });
  expect(ids(result)).toEqual(['fresh']);
});
it('ignores a cancelled request without showing an error', async () => {
  api.get.mockRejectedValueOnce(new axios.CanceledError('cancelled')).mockResolvedValue(page(['a'], null));
  const { result } = setup();
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(result.current.list.error).toBe('');
  expect(ids(result)).toEqual([]);
  act(() => result.current.list.retry());
  await waitFor(() => expect(ids(result)).toEqual(['a']));
});
it('resets to the first page when the server rejects the cursor with 400', async () => {
  api.get.mockImplementation(async (url) => {
    if (url.includes('cursor=')) throw Object.assign(new Error('x'), { response: { status: 400, data: { error: 'Invalid cursor' } } });
    return page(['a', 'b'], 'c1');
  });
  const { result } = setup({}, '/profile?sub=expired');
  await waitFor(() => expect(ids(result)).toEqual(['a', 'b']));
  expect(result.current.location.search).toBe('');
  expect(result.current.list).toMatchObject({ error: '', isFirstPage: true, canNewer: false });
  expect(requestedUrls()).toEqual(['/submissions?limit=10&cursor=expired', '/submissions?limit=10']);
});
it('shows an error, keeps the rows already loaded, and retries', async () => {
  api.get.mockResolvedValueOnce(page(['a'], 'c1')).mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 500, data: { error: 'Request failed' } } }));
  const { result } = setup();
  await waitFor(() => expect(ids(result)).toEqual(['a']));
  act(() => result.current.list.goOlder());
  await waitFor(() => expect(result.current.list.error).toBe('Request failed'));
  expect(ids(result)).toEqual(['a']);
  api.get.mockResolvedValue(page(['c'], null));
  act(() => result.current.list.retry());
  await waitFor(() => expect(ids(result)).toEqual(['c']));
  expect(result.current.list.error).toBe('');
});
it('with syncUrl false, keeps the cursor in state and leaves the URL alone', async () => {
  api.get.mockImplementation(async (url) => (url.includes('cursor=c1') ? page(['c'], null) : page(['a'], 'c1')));
  const { result } = setup({ syncUrl: false });
  await waitFor(() => expect(ids(result)).toEqual(['a']));
  act(() => result.current.list.goOlder());
  await waitFor(() => expect(ids(result)).toEqual(['c']));
  expect(result.current.location.search).toBe('');
  act(() => result.current.list.goNewer());
  await waitFor(() => expect(ids(result)).toEqual(['a']));
});
it('keeps the filter query and adds limit and cursor with the right separator', async () => {
  api.get.mockResolvedValue(page(['a'], 'c1'));
  const { result } = setup({ url: '/submissions?problemId=p1', limit: 5, syncUrl: false });
  await waitFor(() => expect(ids(result)).toEqual(['a']));
  act(() => result.current.list.goOlder());
  await waitFor(() => expect(requestedUrls()).toContain('/submissions?problemId=p1&limit=5&cursor=c1'));
});

it('polls only the first page, quietly, and pauses while the tab is hidden', async () => {
  vi.useFakeTimers();
  api.get.mockResolvedValue(page(['a'], 'c1'));
  const { result } = setup({ pollMs: 2000 });
  await act(async () => {});
  expect(api.get).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(result.current.list.fetching).toBe(false); // a quiet refresh: no skeleton, no disabled controls
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(api.get).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(api.get).toHaveBeenCalledTimes(3);
  api.get.mockResolvedValue(page(['c'], null));
  act(() => result.current.list.goOlder());
  await act(async () => {});
  const calls = api.get.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(api.get.mock.calls.length).toBe(calls); // on an older page nothing polls, so the rows stay put
});
it('a quiet refresh replaces the first page without a loading state and keeps the same row ids', async () => {
  vi.useFakeTimers();
  api.get.mockResolvedValueOnce(page(['a', 'b'], 'c1')).mockResolvedValueOnce(page(['new', 'a', 'b'], 'c1'));
  const { result } = setup({ pollMs: 1000 });
  await act(async () => {});
  expect(ids(result)).toEqual(['a', 'b']);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(ids(result)).toEqual(['new', 'a', 'b']);
  expect(result.current.list.loading).toBe(false);
});
it('never polls over a page the user asked for', async () => {
  vi.useFakeTimers();
  let resolve;
  api.get.mockResolvedValueOnce(page(['a'], 'c1')).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const { result } = setup({ pollMs: 1000, syncUrl: false });
  await act(async () => {});
  act(() => result.current.list.goOlder());
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(api.get).toHaveBeenCalledTimes(2);
  await act(async () => { resolve(page(['c'], null)); });
  expect(ids(result)).toEqual(['c']);
});
it('does not request anything while disabled', async () => {
  const { result } = setup({ enabled: false });
  await act(async () => {});
  expect(api.get).not.toHaveBeenCalled();
  expect(result.current.list.items).toEqual([]);
});

it('drops the rows, cursor and history of the old url as soon as the url changes', async () => {
  api.get.mockImplementation(async (url) => (url.startsWith('/submissions?problemId=p2') ? page(['p2-row'], null) : page(['p1-row'], 'c1')));
  const { result, rerender } = renderHook(({ problem }) => ({
    list: usePagedList({ url: `/submissions?problemId=${problem}`, itemsKey: 'submissions', syncUrl: false }),
  }), { wrapper: wrapper(), initialProps: { problem: 'p1' } });
  await waitFor(() => expect(ids(result)).toEqual(['p1-row']));
  act(() => result.current.list.goOlder());
  await waitFor(() => expect(requestedUrls()).toContain('/submissions?problemId=p1&limit=10&cursor=c1'));
  rerender({ problem: 'p2' });
  expect(result.current.list.items).toEqual([]); // never the old problem's rows
  await waitFor(() => expect(ids(result)).toEqual(['p2-row']));
  expect(requestedUrls().at(-1)).toBe('/submissions?problemId=p2&limit=10');
  expect(result.current.list).toMatchObject({ isFirstPage: true, canNewer: false });
});
it('polls only while pollWhen says so', async () => {
  vi.useFakeTimers();
  const pendingRow = { data: { submissions: [{ _id: 'a', status: 'queued' }], nextCursor: null, hasMore: false } };
  const doneRow = { data: { submissions: [{ _id: 'a', status: 'graded' }], nextCursor: null, hasMore: false } };
  api.get.mockResolvedValueOnce(pendingRow).mockResolvedValue(doneRow);
  const pollWhen = (items) => items.some((i) => i.status === 'queued');
  setup({ pollMs: 1000, pollWhen, syncUrl: false });
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); // refreshes: it was pending
  expect(api.get).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); // graded now: polling stops
  expect(api.get).toHaveBeenCalledTimes(2);
});
