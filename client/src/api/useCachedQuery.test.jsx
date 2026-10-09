import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { invalidate, useCachedQuery } from './useCachedQuery.js';
import { api } from './client.js';

vi.mock('./client.js', () => ({ api: { get: vi.fn() } }));
afterEach(() => { invalidate(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('polls without overlapping requests and stops when disabled', async () => {
  vi.useFakeTimers();
  api.get.mockReset().mockResolvedValue({ data: { submission: { status: 'queued' } } });
  const { result, rerender, unmount } = renderHook(
    ({ enabled }) => useCachedQuery('/submissions/1', { enabled, refetchInterval: 2000 }),
    { initialProps: { enabled: true } }
  );
  await act(async () => {});
  expect(result.current.data?.submission.status).toBe('queued');
  let resolve;
  api.get.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  await act(async () => { vi.advanceTimersByTime(6000); });
  expect(api.get).toHaveBeenCalledTimes(2);
  await act(async () => { resolve({ data: { submission: { status: 'graded' } } }); });
  expect(result.current.data.submission.status).toBe('graded');
  rerender({ enabled: false });
  await act(async () => { vi.advanceTimersByTime(6000); });
  expect(api.get).toHaveBeenCalledTimes(2);
  unmount();
});

it('ignores a response from the previous submission after the URL changes', async () => {
  let resolveOld;
  api.get.mockReset().mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }))
    .mockResolvedValueOnce({ data: { id: 'new' } });
  const { result, rerender } = renderHook(({ url }) => useCachedQuery(url), {
    initialProps: { url: '/old' },
  });
  rerender({ url: '/new' });
  await waitFor(() => expect(result.current.data?.id).toBe('new'));
  await act(async () => { resolveOld({ data: { id: 'old' } }); });
  expect(result.current.data.id).toBe('new');
});

it('does not refill an invalidated cache with an older in-flight response', async () => {
  let resolveOld;
  api.get.mockReset().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce({ data: { id: 'fresh' } });
  const first = renderHook(() => useCachedQuery('/private'));
  invalidate();
  await act(async () => { resolveOld({ data: { id: 'old' } }); });
  const second = renderHook(() => useCachedQuery('/private'));
  expect(second.result.current.data).toBeUndefined();
  await waitFor(() => expect(second.result.current.data?.id).toBe('fresh'));
  expect(api.get).toHaveBeenCalledTimes(2);
  first.unmount(); second.unmount();
});
