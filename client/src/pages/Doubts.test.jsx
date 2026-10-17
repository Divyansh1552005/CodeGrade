import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DoubtBoard from './DoubtBoard.jsx';
import DoubtDetail from './DoubtDetail.jsx';
import AskDoubt from './AskDoubt.jsx';
import { api } from '../api/client.js';

const session = vi.hoisted(() => ({ role: 'student' }));
const paged = vi.hoisted(() => ({ items: [], loading: false, error: '', hasMore: false }));
const data = vi.hoisted(() => ({}));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Alex', role: session.role } }) }));
vi.mock('../api/client.js', () => ({ api: { post: vi.fn() } }));
vi.mock('../api/usePaginatedQuery.js', () => ({ usePaginatedQuery: () => ({ ...paged, loadingMore: false, loadMore: vi.fn(), refetch: vi.fn() }) }));
vi.mock('../api/useCachedQuery.js', () => ({ invalidate: vi.fn(), useCachedQuery: (url) => ({ data: data[url], loading: false, error: '', refetch: vi.fn() }) }));
vi.mock('../components/Markdown.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
beforeEach(() => { session.role = 'student'; Object.assign(paged, { items: [], loading: false, error: '' }); navigate.mockClear(); api.post.mockReset(); });

const doubt = (over = {}) => ({ _id: 'd1', title: 'Why recursion?', body: '**Help** with loops', studentId: { name: 'Sam' }, createdAt: new Date().toISOString(), aiDraftStatus: 'completed', ...over });

it('lists doubts with text statuses and an ask action for students only', () => {
  paged.items = [doubt({ hasApprovedAnswer: true }), doubt({ _id: 'd2', title: 'Heaps', aiDraftStatus: 'failed' })];
  const { unmount } = render(<MemoryRouter><DoubtBoard /></MemoryRouter>);
  const table = screen.getByRole('table', { name: 'Doubts' });
  expect(within(table).getByRole('link', { name: /Why recursion\?/ })).toHaveAttribute('href', '/doubts/d1');
  expect(within(table).getByText('Answered')).toBeInTheDocument();
  expect(within(table).getByText('Awaiting teacher')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ask a doubt' })).toHaveAttribute('href', '/doubts/new');
  unmount();
  session.role = 'teacher';
  render(<MemoryRouter><DoubtBoard /></MemoryRouter>);
  expect(screen.queryByRole('link', { name: 'Ask a doubt' })).not.toBeInTheDocument();
});
it('explains an empty board', () => {
  render(<MemoryRouter><DoubtBoard /></MemoryRouter>);
  expect(screen.getByText('No doubts yet')).toBeInTheDocument();
});

const renderDetail = () => render(<MemoryRouter initialEntries={['/doubts/d1']}><Routes><Route path="/doubts/:id" element={<DoubtDetail />} /></Routes></MemoryRouter>);
it('labels an approved AI draft differently from a teacher-written answer', () => {
  data['/doubts/d1'] = { doubt: doubt({ hasApprovedAnswer: true }) };
  data['/doubts/d1/answer'] = { answer: { content: 'Because of the base case', source: 'ai', reviewedBy: { name: 'Ms Rao' } } };
  const { unmount } = renderDetail();
  const answer = screen.getByRole('region', { name: 'Answer' });
  expect(within(answer).getByText('AI-drafted')).toBeInTheDocument();
  expect(within(answer).getByText('Approved by')).toBeInTheDocument();
  expect(within(answer).queryByText('Teacher-written')).not.toBeInTheDocument();
  unmount();
  data['/doubts/d1/answer'] = { answer: { content: 'Write a base case', source: 'teacher', reviewedBy: { name: 'Ms Rao' } } };
  renderDetail();
  expect(screen.getByText('Teacher-written')).toBeInTheDocument();
  expect(screen.getByText('Answered by')).toBeInTheDocument();
});
it('shows the pending, failed and off-topic states when there is no answer yet', () => {
  data['/doubts/d1/answer'] = { answer: null };
  data['/doubts/d1'] = { doubt: doubt({ aiDraftStatus: 'pending' }) };
  const { unmount } = renderDetail();
  expect(screen.getByRole('status')).toHaveTextContent('Preparing an AI draft for teacher review');
  unmount();
  data['/doubts/d1'] = { doubt: doubt({ aiDraftStatus: 'irrelevant' }) };
  renderDetail();
  expect(screen.getByText(/doesn't look like a programming question/)).toBeInTheDocument();
});

it('requires details, posts the doubt, and opens it', async () => {
  api.post.mockResolvedValue({ data: { doubt: { _id: 'new1' } } });
  render(<MemoryRouter><AskDoubt /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My loop' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post doubt' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Describe your doubt');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Question details' }), { target: { value: 'It skips the last item' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post doubt' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/doubts', { title: 'My loop', body: 'It skips the last item' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/doubts/new1'));
});
