import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NotificationBell from './NotificationBell.jsx';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';

vi.mock('../api/client.js', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', role: 'student' } }) }));

let unread, notifications;
const note = (id, over = {}) => ({ id, type: 'doubt_removed', title: `Title ${id}`, body: `Body ${id}`, link: `/doubts/${id}/removed`, readAt: null, createdAt: new Date().toISOString(), ...over });
beforeEach(() => {
  invalidate();
  unread = 2; notifications = [note('n1'), note('n2', { readAt: '2026-01-01' })];
  api.get.mockReset().mockImplementation(async (url) => {
    if (url === '/notifications/unread-count') return { data: { unread } };
    if (url.startsWith('/notifications')) return { data: { notifications, hasMore: false, nextCursor: null } };
    throw new Error(`Unexpected URL ${url}`);
  });
  api.patch.mockReset().mockResolvedValue({ data: {} });
  api.post.mockReset().mockResolvedValue({ data: { updated: 1 } });
});
afterEach(() => vi.useRealTimers());

const show = () => render(<MemoryRouter initialEntries={['/']}><NotificationBell /><Routes><Route path="/" element={<p>Home</p>} /><Route path="/doubts/:id/removed" element={<p>Removed page</p>} /></Routes></MemoryRouter>);
const openMenu = () => fireEvent.keyDown(screen.getByRole('button', { name: /^Notifications/ }), { key: 'Enter' });

it('shows the unread count in the button name and as a badge', async () => {
  show();
  expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
});
it('shows no badge when everything is read', async () => {
  unread = 0;
  show();
  expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  expect(screen.queryByText('0')).not.toBeInTheDocument();
});
it('opens from the keyboard and lists notifications, marking unread ones for screen readers', async () => {
  show();
  await screen.findByRole('button', { name: 'Notifications, 2 unread' });
  openMenu();
  const menu = await screen.findByRole('menu');
  const items = await within(menu).findAllByRole('menuitem');
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent('Unread: Title n1');
  expect(items[1]).not.toHaveTextContent('Unread');
  expect(items[0]).toHaveTextContent('Body n1');
});
it('marks a notification read and opens its link', async () => {
  show();
  await screen.findByRole('button', { name: 'Notifications, 2 unread' });
  openMenu();
  fireEvent.click((await screen.findAllByRole('menuitem'))[0]);
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/notifications/n1/read'));
  expect(await screen.findByText('Removed page')).toBeInTheDocument();
});
it('does not call the API again for a notification that is already read', async () => {
  show();
  await screen.findByRole('button', { name: 'Notifications, 2 unread' });
  openMenu();
  fireEvent.click((await screen.findAllByRole('menuitem'))[1]);
  expect(await screen.findByText('Removed page')).toBeInTheDocument();
  expect(api.patch).not.toHaveBeenCalled();
});
it('marks everything read', async () => {
  show();
  await screen.findByRole('button', { name: 'Notifications, 2 unread' });
  openMenu();
  fireEvent.click(await screen.findByRole('button', { name: /Mark all read/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/notifications/read-all'));
});
it('says when there is nothing new, and reports a failed load', async () => {
  notifications = [];
  const { unmount } = show();
  await screen.findByRole('button', { name: /^Notifications/ });
  openMenu();
  expect(await screen.findByText('You are up to date.')).toBeInTheDocument();
  unmount();
  invalidate();
  api.get.mockImplementation(async (url) => {
    if (url === '/notifications/unread-count') return { data: { unread: 1 } };
    throw Object.assign(new Error('x'), { response: { data: { error: 'Request failed' } } });
  });
  show();
  await screen.findByRole('button', { name: /^Notifications/ });
  openMenu();
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
});
it('polls the unread count while the tab is visible and not while it is hidden', async () => {
  vi.useFakeTimers();
  show();
  await vi.advanceTimersByTimeAsync(0);
  const calls = () => api.get.mock.calls.filter(([url]) => url === '/notifications/unread-count').length;
  expect(calls()).toBe(1);
  await vi.advanceTimersByTimeAsync(45000);
  expect(calls()).toBe(2);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  await vi.advanceTimersByTimeAsync(45000 * 3);
  expect(calls()).toBe(2);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});
