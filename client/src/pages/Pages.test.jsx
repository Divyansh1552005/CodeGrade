import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '../theme/ThemeContext.jsx';
import LandingPage from './LandingPage.jsx';
import Login from './Login.jsx';
import Register from './Register.jsx';
import Dashboard from './Dashboard.jsx';
import ProblemList from './ProblemList.jsx';
import CreateProblem from './CreateProblem.jsx';
import SubmitCode from './SubmitCode.jsx';
import DoubtBoard from './DoubtBoard.jsx';
import AskDoubt from './AskDoubt.jsx';
import DoubtDetail from './DoubtDetail.jsx';
import TeacherReview from './TeacherReview.jsx';
import Profile from './Profile.jsx';
import Leaderboard from './Leaderboard.jsx';
import NotFound from './NotFound.jsx';
import RouteError from './RouteError.jsx';
import BulkJobs from './BulkJobs.jsx';

const session = vi.hoisted(() => ({ role: 'student', isAuthed: true }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Alex', email: 'alex@example.test', role: session.role }, isAuthed: session.isAuthed, loading: false, login: vi.fn(), register: vi.fn() }) }));
vi.mock('../components/CodeEditor.jsx', () => ({ default: ({ value, onChange }) => <textarea aria-label="Solution code editor" value={value} onChange={(event) => onChange(event.target.value)} /> }));
vi.mock('../api/client.js', () => ({ api: { get: vi.fn(async () => ({ data: { submissions: [], problem: { title: 'Echo', difficulty: 'easy', topics: ['Arrays'], sampleCases: [], testCases: [] } } })), post: vi.fn(), patch: vi.fn() } }));
vi.mock('../api/usePaginatedQuery.js', () => ({ usePaginatedQuery: () => ({ items: [], loading: false, loadingMore: false, hasMore: false, error: '', refetch: vi.fn(), loadMore: vi.fn() }) }));
vi.mock('../api/useCachedQuery.js', () => ({ invalidate: vi.fn(), useCachedQuery: (url) => ({ data: responses[url], loading: false, error: '', refetch: vi.fn() }) }));
const responses = {
  '/problems': { problems: [{ _id: 'p1', title: 'Echo', description: 'Print input.', difficulty: 'easy', topics: ['Arrays'], sampleCases: [], testCases: [] }] },
  '/problems/stats/counts': { total: 1, byTopic: { Arrays: 1 } },
  '/submissions': { submissions: [] }, '/doubts?mine=1': { doubts: [] },
  '/answers?state=pending': { answers: [] }, '/doubts/failed': { doubts: [] },
  '/doubts/d1': { doubt: { title: 'Loop question', body: 'How do loops work?', aiDraftStatus: 'pending', studentId: { name: 'Alex' } } },
  '/doubts/d1/answer': { answer: null },
  '/activity/progress': { progress: { xp: 0, level: 1, xpIntoLevel: 0, xpForNextLevel: 100, solvedCount: 0, currentStreak: 0, longestStreak: 0, badges: [] } },
  '/leaderboard?scope=global': { entries: [] }, '/activity/notifications': { notifications: [] }, '/jobs': { jobs: [] },
};
beforeEach(() => { session.role = 'student'; session.isAuthed = true; });
const pages = [
  ['landing', LandingPage, '/', '/', 'Practice coding and get help when you are stuck', 'public'],
  ['login', Login, '/login', '/login', 'Log in', 'public'],
  ['register', Register, '/register', '/register', 'Create account', 'public'],
  ['student dashboard', Dashboard, '/dashboard', '/dashboard', 'Dashboard', 'student'],
  ['teacher dashboard', Dashboard, '/dashboard', '/dashboard', 'Dashboard', 'teacher'],
  ['problems', ProblemList, '/problems', '/problems', 'Problems', 'student'],
  ['create problem', CreateProblem, '/problems/new', '/problems/new', 'Create a problem', 'teacher'],
  ['edit problem', CreateProblem, '/problems/:id/edit', '/problems/p1/edit', 'Edit problem', 'teacher'],
  ['coding workspace', SubmitCode, '/submit/:problemId', '/submit/p1', 'Echo', 'student'],
  ['doubt board', DoubtBoard, '/doubts', '/doubts', 'Doubts', 'student'],
  ['ask doubt', AskDoubt, '/doubts/new', '/doubts/new', 'Ask a doubt', 'student'],
  ['doubt detail', DoubtDetail, '/doubts/:id', '/doubts/d1', 'Loop question', 'student'],
  ['review queue', TeacherReview, '/review', '/review', 'Review queue', 'teacher'],
  ['profile', Profile, '/profile', '/profile', 'Profile', 'student'],
  ['leaderboard', Leaderboard, '/leaderboard', '/leaderboard', 'Leaderboard', 'student'],
  ['not found', NotFound, '*', '/missing', 'Page not found', 'student'],
  ['route error', RouteError, '/error', '/error', 'This page couldn’t load', 'student'],
  ['bulk jobs', BulkJobs, '/bulk-jobs', '/bulk-jobs', 'Imports and reports', 'teacher'],
];
it.each(pages.flatMap((page) => ['light', 'dark'].map((theme) => [...page, theme])))('renders the %s route with one page heading and no live API requirement', async (_label, Component, path, entry, heading, role, theme) => {
  localStorage.setItem('theme', theme);
  session.role = role === 'public' ? 'student' : role; session.isAuthed = role !== 'public';
  render(<ThemeProvider><MemoryRouter initialEntries={[entry]}><Routes><Route path={path} element={<Component />} /></Routes></MemoryRouter></ThemeProvider>);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument());
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
});
