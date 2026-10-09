import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ActivityPanel from './ActivityPanel.jsx';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';

vi.mock('../api/client.js', () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
beforeEach(() => {
  invalidate(); api.get.mockReset(); api.patch.mockReset();
  api.get.mockImplementation(async (url) => ({ data: url === '/activity/progress' ? { progress: {
    xp: 300, level: 2, xpIntoLevel: 200, xpForNextLevel: 300, solvedCount: 1, currentStreak: 2, longestStreak: 5,
    badges: [{ key: 'first-solve', name: 'First solve', description: 'Solve your first problem.', icon: '🌱' }],
  } } : url.startsWith('/leaderboard') ? { entries: [{ _id: 'stats1', studentId: { name: 'Alex' }, xp: 300 }] } : { notifications: [] } }));
});
it('renders level progress, streak flame and earned badge shelf', async () => {
  render(<MemoryRouter><ActivityPanel isStudent userId="student" /></MemoryRouter>);
  expect(await screen.findByText('Level 2 · 300 XP')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
  expect(screen.getByText(/2 day streak · 5 day best/)).toBeInTheDocument();
  expect(screen.getByTitle('Solve your first problem.')).toBeInTheDocument();
  expect(await screen.findByText('1. Alex')).toBeInTheDocument();
});
it('switches mini-leaderboard to a chosen topic', async () => {
  render(<MemoryRouter><ActivityPanel isStudent userId="student" /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Leaderboard scope'), { target: { value: 'Dynamic Programming' } });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/leaderboard?scope=topic&topic=Dynamic%20Programming'));
});
it('keeps student gamification private on a teacher dashboard', async () => {
  render(<MemoryRouter><ActivityPanel isStudent={false} userId="teacher" /></MemoryRouter>);
  expect(await screen.findByText('1. Alex')).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith('/activity/progress');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
