import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Profile from './Profile.jsx';
import { api } from '../api/client.js';

const session = vi.hoisted(() => ({ role: 'student' }));
const data = vi.hoisted(() => ({}));
vi.mock('../api/client.js', () => ({ api: { get: vi.fn() } }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Alex Doe', email: 'alex@example.test', role: session.role } }) }));
vi.mock('../api/useCachedQuery.js', () => ({ useCachedQuery: (url, { enabled = true } = {}) => ({ data: enabled ? data[url] : undefined, loading: false, error: '', refetch: vi.fn() }) }));
beforeEach(() => {
  session.role = 'student';
  Object.assign(data, {
    '/problems/stats/counts': { total: 10, byTopic: {} },
    '/problems': { problems: [{ _id: 'p1', difficulty: 'easy', topics: ['Arrays'], solved: true }] },
    '/activity/progress': { progress: { level: 3, xp: 420, solvedCount: 4, currentStreak: 2, longestStreak: 5, badges: [] } },
  });
  api.get.mockReset().mockImplementation(async (url) => {
    if (url.startsWith('/submissions')) return { data: { submissions: [{ _id: 's1', problemId: 'p1', problemTitle: 'Two sum', status: 'graded', passCount: 2, totalCount: 2, language: 'python', createdAt: new Date().toISOString() }], nextCursor: null, hasMore: false } };
    if (url.startsWith('/doubts')) return { data: { doubts: [
      { _id: 'd1', title: 'Why recursion?', preview: 'I do not get the base case', hasApprovedAnswer: true, createdAt: new Date().toISOString() },
      { _id: 'd2', title: 'Heap question', aiDraftStatus: 'failed', createdAt: new Date().toISOString() },
    ], nextCursor: null, hasMore: false } };
    throw new Error(`Unexpected URL ${url}`);
  });
});
const renderProfile = () => render(<MemoryRouter><Profile /></MemoryRouter>);

it('summarises a student with stats, submissions and doubts with text statuses', async () => {
  renderProfile();
  const summary = screen.getByRole('region', { name: 'Summary' });
  expect(within(summary).getByText('4/10')).toBeInTheDocument();
  expect(within(summary).getByText('420')).toBeInTheDocument();
  expect(within(await screen.findByRole('table', { name: 'Submissions' })).getByText('Accepted')).toBeInTheDocument();
  const doubts = within(await screen.findByRole('table', { name: 'Your doubts' }));
  expect(doubts.getByText('Answered')).toBeInTheDocument();
  expect(doubts.getByText('Awaiting teacher')).toBeInTheDocument();
  expect(doubts.getByText('I do not get the base case')).toBeInTheDocument();
});
it('asks the server for ten rows of each list, never the whole history', async () => {
  renderProfile();
  await screen.findByRole('table', { name: 'Submissions' });
  const urls = api.get.mock.calls.map(([url]) => url);
  expect(urls).toContain('/submissions?limit=10');
  expect(urls).toContain('/doubts?mine=1&limit=10');
  expect(urls).not.toContain('/submissions');
});
it('shows no totals computed from the lists', async () => {
  renderProfile();
  await screen.findByRole('table', { name: 'Submissions' });
  expect(screen.queryByText(/Showing the latest/)).not.toBeInTheDocument();
});
it('keeps student sections off a teacher profile', () => {
  session.role = 'teacher';
  renderProfile();
  expect(screen.getByText('Problems in the library')).toBeInTheDocument();
  expect(screen.queryByRole('table', { name: 'Submissions' })).not.toBeInTheDocument();
  expect(screen.queryByText('Doubts')).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});
