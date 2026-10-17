import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProblemList from './ProblemList.jsx';

const session = vi.hoisted(() => ({ role: 'student' }));
const paged = vi.hoisted(() => ({ items: [], hasMore: false, loading: false, error: '', loadMore: vi.fn(), refetch: vi.fn() }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Alex', role: session.role } }) }));
vi.mock('../api/client.js', () => ({ api: { delete: vi.fn() } }));
vi.mock('../api/usePaginatedQuery.js', () => ({ usePaginatedQuery: () => ({ ...paged, loadingMore: false }) }));
vi.mock('../api/useCachedQuery.js', () => ({ useCachedQuery: () => ({ data: { total: 3, byTopic: { Arrays: 2, Graphs: 1 } } }) }));

const problems = [
  { _id: 'p1', number: 1, title: 'Two sum', difficulty: 'easy', topics: ['Arrays'], solved: true, createdBy: 'u1', testCases: [{}, {}] },
  { _id: 'p2', number: 2, title: 'Merge intervals', difficulty: 'medium', topics: ['Arrays', 'Sorting', 'Greedy'], createdBy: 'other', testCases: [{}] },
  { _id: 'p3', number: 3, title: 'Course schedule', difficulty: 'hard', topics: ['Graphs'], createdBy: 'other', testCases: [{}] },
];
const renderList = () => render(<MemoryRouter><ProblemList /></MemoryRouter>);
beforeEach(() => {
  session.role = 'student';
  Object.assign(paged, { items: problems, hasMore: false, loading: false, error: '' });
});

it('lists problems in a table with a solved marker and links to the workspace', () => {
  renderList();
  const table = screen.getByRole('table', { name: 'Problems' });
  expect(within(table).getAllByRole('row')).toHaveLength(4);
  expect(within(table).getByRole('link', { name: 'Two sum' })).toHaveAttribute('href', '/submit/p1');
  expect(within(within(table).getAllByRole('row')[1]).getByText('Solved')).toBeInTheDocument();
  expect(within(table).getByText('+1')).toBeInTheDocument();
});
it('filters by search, difficulty and status, and clears the filters', () => {
  renderList();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search problems' }), { target: { value: 'course' } });
  expect(screen.getAllByRole('row')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'medium' } });
  expect(screen.getByText('Merge intervals')).toBeInTheDocument();
  expect(screen.queryByText('Two sum')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'solved' } });
  expect(screen.getAllByRole('row')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'unsolved' } });
  expect(screen.queryByText('Two sum')).not.toBeInTheDocument();
});
it('explains when nothing matches and warns that filters only cover loaded problems', () => {
  paged.hasMore = true;
  renderList();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search problems' }), { target: { value: 'zzz' } });
  expect(screen.getByText('No matching problems')).toBeInTheDocument();
  expect(screen.getByText(/Load more to search further/)).toBeInTheDocument();
});
it('shows a skeleton while loading and an error with retry', () => {
  paged.loading = true;
  const { unmount } = renderList();
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  unmount();
  Object.assign(paged, { loading: false, items: [], error: 'Request failed' });
  renderList();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(paged.refetch).toHaveBeenCalled();
});
it('gives teachers edit and delete only on their own problems, without solve status', () => {
  session.role = 'teacher';
  renderList();
  expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Edit Two sum' })).toHaveAttribute('href', '/problems/p1/edit');
  expect(screen.queryByRole('link', { name: 'Edit Merge intervals' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Create problem' })).toHaveAttribute('href', '/problems/new');
});
