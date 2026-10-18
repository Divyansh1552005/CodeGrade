import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePaginatedQuery } from './usePaginatedQuery.js';
import { api } from './client.js';

vi.mock('./client.js', () => ({ api: { get: vi.fn() } }));
beforeEach(() => { api.get.mockReset(); });

it('starts again from page one when the cursor of a load-more is rejected with a 400', async () => {
  api.get.mockImplementation(async (url) => {
    if (url.includes('cursor=old')) throw Object.assign(new Error('bad'), { response: { status: 400, data: { error: 'Invalid cursor' } } });
    return { data: { doubts: [{ _id: 'd1' }], nextCursor: 'old', hasMore: true } };
  });
  const { result } = renderHook(() => usePaginatedQuery('/doubts?status=open', 'doubts'));
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  act(() => result.current.loadMore());
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(result.current.loadingMore).toBe(false));
  expect(api.get.mock.calls[2][0]).toBe('/doubts?status=open&limit=20');
  expect(result.current.items).toEqual([{ _id: 'd1' }]);
  expect(result.current.error).toBe('');
});
