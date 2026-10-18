import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import ProfileSubmissions from './ProfileSubmissions.jsx';
import ProfileDoubts from './ProfileDoubts.jsx';
import { api } from '../../api/client.js';

vi.mock('../../api/client.js', () => ({ api: { get: vi.fn() } }));

const sub = (id) => ({ _id: id, problemId: 'p1', problemTitle: `Problem ${id}`, status: 'graded', passCount: 1, totalCount: 1, language: 'python', createdAt: new Date().toISOString() });
const subPage = (ids, nextCursor = null) => ({ data: { submissions: ids.map(sub), nextCursor, hasMore: Boolean(nextCursor) } });
const dbtPage = (ids, nextCursor = null) => ({ data: { doubts: ids.map((id) => ({ _id: id, title: `Doubt ${id}`, preview: `preview ${id}`, createdAt: new Date().toISOString() })), nextCursor, hasMore: Boolean(nextCursor) } });
const Search = () => <output data-testid="search">{useLocation().search}</output>;
const renderBoth = (initial = '/profile') => render(<MemoryRouter initialEntries={[initial]}><ProfileSubmissions /><ProfileDoubts /><Search /></MemoryRouter>);
const search = () => screen.getByTestId('search').textContent;
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => { api.get.mockReset(); });

it('shows skeleton rows while the first page loads, then the rows', async () => {
  const gate = deferred();
  api.get.mockImplementation((url) => (url.startsWith('/submissions') ? gate.promise : Promise.resolve(dbtPage([]))));
  renderBoth();
  expect(screen.getByText('Loading submissions')).toBeInTheDocument();
  gate.resolve(subPage(['a']));
  expect(await screen.findByText('Problem a')).toBeInTheDocument();
  expect(screen.queryByText('Loading submissions')).not.toBeInTheDocument();
});
it('shows an empty state for each list', async () => {
  api.get.mockImplementation(async (url) => (url.startsWith('/submissions') ? subPage([]) : dbtPage([])));
  renderBoth();
  expect(await screen.findByText('No submissions yet')).toBeInTheDocument();
});
it('shows an error with a retry that loads the list', async () => {
  api.get.mockImplementation(async (url) => { if (url.startsWith('/doubts')) return dbtPage([]); throw new Error('boom'); });
  renderBoth();
  const retry = await screen.findByRole('button', { name: /retry|try again/i });
  api.get.mockImplementation(async (url) => (url.startsWith('/submissions') ? subPage(['a']) : dbtPage([])));
  fireEvent.click(retry);
  expect(await screen.findByText('Problem a')).toBeInTheDocument();
});
it('pages Older, Newer and Newest, keeping each list cursor in its own URL parameter', async () => {
  api.get.mockImplementation(async (url) => {
    if (url.startsWith('/doubts')) return url.includes('cursor=d1') ? dbtPage(['d3']) : dbtPage(['d1', 'd2'], 'd1');
    return url.includes('cursor=c1') ? subPage(['b']) : subPage(['a'], 'c1');
  });
  renderBoth();
  await screen.findByText('Problem a');
  expect(screen.getByRole('button', { name: 'Newer submissions' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Older submissions' }));
  expect(await screen.findByText('Problem b')).toBeInTheDocument();
  expect(search()).toBe('?sub=c1');
  fireEvent.click(screen.getByRole('button', { name: 'Older doubts' }));
  await screen.findByText('Doubt d3');
  expect(search()).toContain('sub=c1');
  expect(search()).toContain('dbt=d1');
  fireEvent.click(screen.getByRole('button', { name: 'Back to the newest submissions' }));
  expect(await screen.findByText('Problem a')).toBeInTheDocument();
  expect(search()).not.toContain('sub=');
  expect(search()).toContain('dbt=d1');
});
it('keeps the previous rows and disables the controls while the next page loads', async () => {
  const gate = deferred();
  api.get.mockImplementation((url) => {
    if (url.startsWith('/doubts')) return Promise.resolve(dbtPage([]));
    return url.includes('cursor=') ? gate.promise : Promise.resolve(subPage(['a'], 'c1'));
  });
  renderBoth();
  await screen.findByText('Problem a');
  fireEvent.click(screen.getByRole('button', { name: 'Older submissions' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Older submissions' })).toBeDisabled());
  expect(screen.getByText('Problem a')).toBeInTheDocument();
  gate.resolve(subPage(['b']));
  expect(await screen.findByText('Problem b')).toBeInTheDocument();
});
it('resets one list to its first page when its cursor is rejected, and leaves the other alone', async () => {
  api.get.mockImplementation(async (url) => {
    if (url.startsWith('/doubts')) return url.includes('cursor=dd') ? dbtPage(['d3']) : dbtPage(['d1'], 'dd');
    if (url.includes('cursor=stale')) throw Object.assign(new Error('Invalid cursor'), { response: { status: 400 } });
    return subPage(['a']);
  });
  renderBoth('/profile?sub=stale&dbt=dd');
  expect(await screen.findByText('Problem a')).toBeInTheDocument();
  expect(await screen.findByText('Doubt d3')).toBeInTheDocument();
  expect(search()).not.toContain('sub=');
  expect(search()).toContain('dbt=dd');
});
it('renders the server preview in the doubts list', async () => {
  api.get.mockImplementation(async (url) => (url.startsWith('/doubts') ? dbtPage(['d1']) : subPage([])));
  renderBoth();
  const table = within(await screen.findByRole('table', { name: 'Your doubts' }));
  expect(table.getByText('preview d1')).toBeInTheDocument();
});
