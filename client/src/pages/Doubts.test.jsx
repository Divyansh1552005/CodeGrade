import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DoubtBoard from './DoubtBoard.jsx';
import DoubtDetail from './DoubtDetail.jsx';
import AskDoubt from './AskDoubt.jsx';
import { doubtStatus } from '../lib/doubtStatus.js';
import { api } from '../api/client.js';

const session = vi.hoisted(() => ({ role: 'student' }));
const paged = vi.hoisted(() => ({ items: [], loading: false, error: '', hasMore: false }));
const data = vi.hoisted(() => ({}));
const errors = vi.hoisted(() => ({}));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Alex', role: session.role } }) }));
vi.mock('../api/client.js', () => ({ api: { post: vi.fn() } }));
const urls = vi.hoisted(() => []);
vi.mock('../api/usePaginatedQuery.js', () => ({ usePaginatedQuery: (url) => { urls.push(url); return { ...paged, loadingMore: false, loadMore: vi.fn(), refetch: vi.fn() }; } }));
vi.mock('../api/useCachedQuery.js', () => ({ invalidate: vi.fn(), useCachedQuery: (url) => ({ data: data[url], loading: false, error: errors[url] || '', refetch: vi.fn() }) }));
vi.mock('../components/Markdown.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
beforeEach(() => {
  session.role = 'student'; Object.assign(paged, { items: [], loading: false, error: '' }); navigate.mockClear(); api.post.mockReset();
  urls.length = 0;
  for (const key of Object.keys(errors)) delete errors[key];
  for (const key of Object.keys(data)) delete data[key];
});

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

describe('doubts in the checking, appealed and removed states', () => {
  it('maps statuses to labels, showing Appealed only to teachers', () => {
    expect(doubtStatus({ status: 'pending_triage' })).toEqual({ label: 'Checking', tone: 'info' });
    expect(doubtStatus({ status: 'appealed' }, 'teacher')).toEqual({ label: 'Appealed', tone: 'warning' });
    expect(doubtStatus({ status: 'appealed' }, 'student').label).toBe('Awaiting review');
    expect(doubtStatus({ status: 'appealed', hasApprovedAnswer: true }, 'teacher').label).toBe('Answered');
    expect(doubtStatus({ status: 'pending_review', aiDraftStatus: 'failed' }).label).toBe('Awaiting teacher');
    expect(doubtStatus({ status: 'pending_review', aiDraftStatus: 'skipped' }).label).toBe('Awaiting teacher');
  });
  it('shows a Checking badge on the board for a doubt still being checked', () => {
    paged.items = [doubt({ status: 'pending_triage' })];
    render(<MemoryRouter><DoubtBoard /></MemoryRouter>);
    expect(within(screen.getByRole('table', { name: 'Doubts' })).getByText('Checking')).toBeInTheDocument();
  });
  it('explains on the detail page that a new doubt is being checked', () => {
    data['/doubts/d1'] = { doubt: doubt({ status: 'pending_triage' }) };
    data['/doubts/d1/answer'] = { answer: null };
    renderDetail();
    expect(screen.getByText('Checking')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('We are checking your doubt before it is shared');
  });
  it('points to notifications when a doubt is not available', () => {
    errors['/doubts/d1'] = 'Doubt not found';
    renderDetail();
    expect(screen.getByText('This doubt is not available')).toBeInTheDocument();
    expect(screen.getByText(/check your notifications/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to doubts' })).toHaveAttribute('href', '/doubts');
  });
  it('shows the code snippet and a link to the related problem to students', () => {
    data['/doubts/d1'] = { doubt: doubt({ code: 'print(missing)', problemId: 'p9' }) };
    data['/doubts/d1/answer'] = { answer: null };
    renderDetail();
    expect(screen.getByText('print(missing)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the related problem' })).toHaveAttribute('href', '/submit/p9');
  });
});

describe('asking a doubt about a problem', () => {
  const renderAsk = (path = '/doubts/new') => render(<MemoryRouter initialEntries={[path]}><AskDoubt /></MemoryRouter>);
  beforeEach(() => { data['/problems'] = { problems: [{ _id: 'p1', title: 'Two sum' }, { _id: 'p2', title: 'Anagrams' }] }; });
  it('preselects the problem when opened from a problem page and sends it with the code snippet', async () => {
    api.post.mockResolvedValue({ data: { doubt: { _id: 'new1' } } });
    renderAsk('/doubts/new?problem=p2');
    expect(screen.getByLabelText('Problem (optional)')).toHaveValue('p2');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My loop' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Question details' }), { target: { value: 'It skips the last item' } });
    fireEvent.change(screen.getByLabelText('Code snippet (optional)'), { target: { value: 'for i in range(n - 1): pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post doubt' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/doubts', { title: 'My loop', body: 'It skips the last item', problemId: 'p2', code: 'for i in range(n - 1): pass' }));
  });
  it('sends neither problem nor code when they are left empty', async () => {
    api.post.mockResolvedValue({ data: { doubt: { _id: 'new1' } } });
    renderAsk();
    expect(screen.getByLabelText('Problem (optional)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My loop' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Question details' }), { target: { value: 'details' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post doubt' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/doubts', { title: 'My loop', body: 'details' }));
  });
  it('shows the daily limit message from the server', async () => {
    api.post.mockRejectedValue({ response: { status: 429, data: { error: 'You can post at most 10 doubts a day. You can post again after the daily reset.' } } });
    renderAsk();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My loop' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Question details' }), { target: { value: 'details' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post doubt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at most 10 doubts a day');
  });
});

describe('filtering the board', () => {
  const lastUrl = () => urls[urls.length - 1];
  it('starts unfiltered and asks the server for the chosen status', () => {
    render(<MemoryRouter><DoubtBoard /></MemoryRouter>);
    expect(lastUrl()).toBe('/doubts');
    const select = screen.getByLabelText('Status');
    expect([...select.options].map((o) => o.textContent)).toEqual(['All statuses', 'Awaiting review', 'Awaiting teacher', 'Answered']);
    fireEvent.change(select, { target: { value: 'answered' } });
    expect(lastUrl()).toBe('/doubts?status=answered');
    fireEvent.change(select, { target: { value: 'awaiting_review' } });
    expect(lastUrl()).toBe('/doubts?status=awaiting_review');
  });
  it('lets a student show only their own doubts, together with a status', () => {
    render(<MemoryRouter><DoubtBoard /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText('My doubts'));
    expect(lastUrl()).toBe('/doubts?mine=1');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'awaiting_teacher' } });
    expect(lastUrl()).toBe('/doubts?status=awaiting_teacher&mine=1');
  });
  it('gives teachers the status filter without the My doubts option', () => {
    session.role = 'teacher';
    render(<MemoryRouter><DoubtBoard /></MemoryRouter>);
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.queryByLabelText('My doubts')).not.toBeInTheDocument();
  });
  it('explains an empty result for a filter and clears the filters', () => {
    render(<MemoryRouter><DoubtBoard /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'answered' } });
    expect(screen.getByText('No doubts match these filters')).toBeInTheDocument();
    expect(screen.queryByText('No doubts yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    expect(lastUrl()).toBe('/doubts');
    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(screen.getByText('No doubts yet')).toBeInTheDocument();
  });
  it('keeps the rows from the server as they are', () => {
    paged.items = [doubt({ hasApprovedAnswer: true })];
    render(<MemoryRouter><DoubtBoard /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'answered' } });
    expect(within(screen.getByRole('table', { name: 'Doubts' })).getByText('Answered')).toBeInTheDocument();
  });
});
