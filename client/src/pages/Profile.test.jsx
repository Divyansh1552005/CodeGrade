import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Profile from './Profile.jsx';

const session = vi.hoisted(() => ({ role: 'student' }));
const data = vi.hoisted(() => ({}));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Alex Doe', email: 'alex@example.test', role: session.role } }) }));
vi.mock('../api/useCachedQuery.js', () => ({ useCachedQuery: (url, { enabled = true } = {}) => ({ data: enabled ? data[url] : undefined, loading: false, error: '', refetch: vi.fn() }) }));
beforeEach(() => {
  session.role = 'student';
  Object.assign(data, {
    '/problems/stats/counts': { total: 10, byTopic: {} },
    '/problems': { problems: [{ _id: 'p1', difficulty: 'easy', topics: ['Arrays'], solved: true }] },
    '/activity/progress': { progress: { level: 3, xp: 420, solvedCount: 4, currentStreak: 2, longestStreak: 5, badges: [] } },
    '/submissions': { submissions: [{ _id: 's1', problemId: { _id: 'p1', title: 'Two sum' }, status: 'graded', passCount: 2, totalCount: 2, language: 'python', createdAt: new Date().toISOString() }] },
    '/doubts?mine=1': { doubts: [{ _id: 'd1', title: 'Why recursion?', hasApprovedAnswer: true, createdAt: new Date().toISOString() }, { _id: 'd2', title: 'Heap question', aiDraftStatus: 'failed', createdAt: new Date().toISOString() }] },
  });
});
const renderProfile = () => render(<MemoryRouter><Profile /></MemoryRouter>);

it('summarises a student with stats, submissions and doubts with text statuses', () => {
  renderProfile();
  const summary = screen.getByRole('region', { name: 'Summary' });
  expect(within(summary).getByText('4/10')).toBeInTheDocument();
  expect(within(summary).getByText('420')).toBeInTheDocument();
  expect(within(screen.getByRole('table', { name: 'Submissions' })).getByText('Accepted')).toBeInTheDocument();
  const doubts = within(screen.getByRole('table', { name: 'Your doubts' }));
  expect(doubts.getByText('Answered')).toBeInTheDocument();
  expect(doubts.getByText('Awaiting teacher')).toBeInTheDocument();
});
it('keeps student sections off a teacher profile', () => {
  session.role = 'teacher';
  renderProfile();
  expect(screen.getByText('Problems in the library')).toBeInTheDocument();
  expect(screen.queryByRole('table', { name: 'Submissions' })).not.toBeInTheDocument();
  expect(screen.queryByText('Doubts')).not.toBeInTheDocument();
});
