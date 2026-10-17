import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Leaderboard from './Leaderboard.jsx';

const state = vi.hoisted(() => ({ calls: [], result: {} }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'me', name: 'Alex', role: 'student' } }) }));
vi.mock('../api/useCachedQuery.js', () => ({ useCachedQuery: (url) => { state.calls.push(url); return { loading: false, error: '', refetch: vi.fn(), ...state.result }; } }));
const entries = [
  { _id: 's1', xp: 500, level: 4, solvedCount: 9, studentId: { _id: 'other', name: 'Sam' } },
  { _id: 's2', xp: 300, level: 2, solvedCount: 4, studentId: { _id: 'me', name: 'Alex' } },
];
beforeEach(() => { state.calls = []; state.result = { data: { entries } }; });

it('shows a plain ranked table and highlights the current user', () => {
  render(<Leaderboard />);
  const rows = within(screen.getByRole('table', { name: 'Leaderboard' })).getAllByRole('row');
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText('Sam')).toBeInTheDocument();
  expect(rows[1]).not.toHaveAttribute('aria-current');
  expect(rows[2]).toHaveAttribute('aria-current', 'true');
  expect(within(rows[2]).getByText('You')).toBeInTheDocument();
  expect(within(rows[2]).getByText('300')).toBeInTheDocument();
});
it('switches to a topic leaderboard', () => {
  render(<Leaderboard />);
  fireEvent.change(screen.getByLabelText('Leaderboard scope'), { target: { value: 'Dynamic Programming' } });
  expect(state.calls).toContain('/leaderboard?scope=topic&topic=Dynamic%20Programming');
});
it('explains an empty board and a failed load', () => {
  state.result = { data: { entries: [] } };
  const { unmount } = render(<Leaderboard />);
  expect(screen.getByText('No rankings yet')).toBeInTheDocument();
  unmount();
  state.result = { data: undefined, error: 'Request failed' };
  render(<Leaderboard />);
  expect(screen.getByRole('alert')).toHaveTextContent('Request failed');
});
