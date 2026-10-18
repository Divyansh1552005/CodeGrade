import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard.jsx';
import { pickNext } from '../components/dashboard/NextUp.jsx';
import { api } from '../api/client.js';

const session = vi.hoisted(() => ({ role: 'student' }));
const data = vi.hoisted(() => ({}));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Alex', role: session.role } }) }));
vi.mock('../api/client.js', () => ({ api: { patch: vi.fn() } }));
vi.mock('../api/useCachedQuery.js', () => ({
  useCachedQuery: (url, { enabled = true } = {}) => { data.ask?.(url); return { data: enabled ? data[url] : undefined, loading: false, error: '', refetch: data.refetch }; },
}));

const problems = [
  { _id: 'p1', number: 1, title: 'Two sum', difficulty: 'easy', topics: ['Arrays'], solved: true },
  { _id: 'p2', number: 2, title: 'Merge intervals', difficulty: 'medium', topics: ['Arrays', 'Sorting'], solved: false },
  { _id: 'p3', number: 3, title: 'Course schedule', difficulty: 'hard', topics: ['Graphs'], solved: false },
];
const submission = (over = {}) => ({ _id: 's1', problemId: 'p2', problemTitle: 'Merge intervals', status: 'graded', passCount: 1, totalCount: 3, language: 'python', createdAt: new Date().toISOString(), ...over });
beforeEach(() => {
  delete data.ask;
  session.role = 'student';
  Object.assign(data, {
    refetch: vi.fn(),
    '/problems': { problems },
    '/problems/stats/counts': { total: 3, byTopic: {} },
    '/submissions?limit=5': { submissions: [submission()] },
    '/activity/progress': { progress: { level: 2, xp: 300, xpIntoLevel: 200, xpForNextLevel: 300, solvedCount: 1, currentStreak: 2, longestStreak: 5, badges: [{ key: 'first-solve', name: 'First solve', description: 'Solve your first problem.', icon: 'x' }] } },
    '/activity/notifications': { notifications: [{ _id: 'n1', message: 'Your doubt was answered', href: '/doubts/d1', readAt: null }] },
    '/answers?state=pending': { answers: [{}, {}] },
  });
});
const renderDashboard = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);

it('resumes the last unsolved attempt, else the lowest-numbered unsolved problem, else reports done', () => {
  expect(pickNext(problems, [submission({ problemId: 'p3' })]).problem._id).toBe('p3');
  expect(pickNext(problems, [submission({ problemId: 'p1' })])).toMatchObject({ kind: 'start', problem: { _id: 'p2' } });
  expect(pickNext(problems, [])).toMatchObject({ kind: 'start', problem: { _id: 'p2' } });
  expect(pickNext(problems.map((p) => ({ ...p, solved: true })), []).kind).toBe('done');
});
it('shows what to do next, progress, recent submissions and breakdowns for a student', () => {
  renderDashboard();
  expect(screen.getByText('Continue where you left off')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Continue solving' })).toHaveAttribute('href', '/submit/p2');
  expect(screen.getByText('Level 2')).toBeInTheDocument();
  expect(screen.getByText('300 XP')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'XP toward next level' })).toHaveAttribute('aria-valuenow', '67');
  expect(screen.getByText('2 day streak')).toBeInTheDocument();
  const table = screen.getByRole('table', { name: 'Recent submissions' });
  expect(within(table).getByRole('link', { name: 'Merge intervals' })).toHaveAttribute('href', '/submit/p2');
  expect(within(table).getByText('1/3')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Easy solved' })).toHaveAttribute('aria-valuenow', '100');
  expect(screen.getByRole('progressbar', { name: 'Arrays solved' })).toHaveAttribute('aria-valuenow', '50');
  expect(screen.getByText('First solve')).toBeInTheDocument();
  expect(screen.queryByText(/leaderboard/i)).not.toBeInTheDocument();
});
it('uses empty states when there are no submissions or badges', () => {
  data['/submissions?limit=5'] = { submissions: [] };
  data['/activity/progress'].progress.badges = [];
  renderDashboard();
  expect(screen.getByText('No submissions yet')).toBeInTheDocument();
  expect(screen.getByText('Your first solve unlocks your first badge.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Start solving' })).toHaveAttribute('href', '/submit/p2');
});
it('marks a notification read and refreshes the list', async () => {
  api.patch.mockResolvedValue({});
  renderDashboard();
  fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/activity/notifications/n1/read'));
  await waitFor(() => expect(data.refetch).toHaveBeenCalled());
});
it('keeps student gamification off the teacher dashboard', () => {
  session.role = 'teacher';
  renderDashboard();
  expect(screen.getByRole('link', { name: 'Open queue' })).toHaveAttribute('href', '/review');
  expect(within(screen.getByRole('region', { name: 'Review queue' })).getByText('2')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText('Your progress')).not.toBeInTheDocument();
});

it('asks the server for only the five latest submissions, and never shows an "of N" count', () => {
  const asked = [];
  data.ask = (url) => asked.push(url);
  renderDashboard();
  expect(asked).toContain('/submissions?limit=5');
  expect(asked).not.toContain('/submissions');
  expect(screen.queryByText(/Showing the latest/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'All submissions' })).toHaveAttribute('href', '/profile');
});
