import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { api } from '../../api/client.js';
import { announceCountsChanged, usePendingCount } from './usePendingCount.js';

vi.mock('../../api/client.js', () => ({ api: { get: vi.fn() } }));
const hidden = (value) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
const pending = (n) => ({ data: { counts: { pending: n } } });

beforeEach(() => { vi.useFakeTimers(); api.get.mockReset().mockResolvedValue(pending(2)); hidden(false); });
afterEach(() => { vi.useRealTimers(); hidden(false); });

it('loads once, then refreshes every 60 seconds while the tab is visible', async () => {
  const { result } = renderHook(() => usePendingCount());
  await act(async () => {});
  expect(result.current).toBe(2);
  expect(api.get).toHaveBeenCalledTimes(1);
  api.get.mockResolvedValue(pending(5));
  await act(async () => { await vi.advanceTimersByTimeAsync(59000); });
  expect(api.get).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(result.current).toBe(5);
});
it('skips the refresh while the tab is hidden, and resumes when visible', async () => {
  renderHook(() => usePendingCount());
  await act(async () => {});
  hidden(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(180000); });
  expect(api.get).toHaveBeenCalledTimes(1);
  hidden(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(api.get).toHaveBeenCalledTimes(2);
});
it('refreshes at once when a decision is announced, keeps the old value on an error, and stops on unmount', async () => {
  const { result, unmount } = renderHook(() => usePendingCount());
  await act(async () => {});
  api.get.mockResolvedValue(pending(1));
  await act(async () => { announceCountsChanged(); });
  expect(result.current).toBe(1);
  api.get.mockRejectedValue(new Error('down'));
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(result.current).toBe(1);
  unmount();
  api.get.mockClear();
  await act(async () => { announceCountsChanged(); await vi.advanceTimersByTimeAsync(120000); });
  expect(api.get).not.toHaveBeenCalled();
});
