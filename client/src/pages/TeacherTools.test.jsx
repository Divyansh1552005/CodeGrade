import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeacherReview from './TeacherReview.jsx';
import CreateProblem from './CreateProblem.jsx';
import { api } from '../api/client.js';

const data = vi.hoisted(() => ({}));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../api/client.js', () => ({ api: { patch: vi.fn(), post: vi.fn(), get: vi.fn() } }));
vi.mock('../api/useCachedQuery.js', () => ({ invalidate: vi.fn(), useCachedQuery: (url) => ({ data: data[url], loading: false, error: '', refetch: vi.fn() }) }));
vi.mock('../components/Markdown.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../components/CodeEditor.jsx', () => ({ default: ({ value, onChange }) => <textarea aria-label="Starter code editor" value={value} onChange={(e) => onChange(e.target.value)} /> }));
beforeEach(() => {
  api.patch.mockReset(); api.post.mockReset(); navigate.mockClear();
  data['/answers?state=pending'] = { answers: [{ _id: 'a1', source: 'ai', state: 'pending', content: 'Draft text', doubtId: { title: 'Why loops?', body: 'Explain loops' } }] };
  data['/doubts/failed'] = { doubts: [{ _id: 'd9', title: 'Heap help', body: 'What is a heap?', aiDraftStatus: 'failed', studentId: { name: 'Sam' } }] };
});

it('approves or rejects a draft with the edited content and review notes', async () => {
  api.patch.mockResolvedValue({});
  render(<MemoryRouter><TeacherReview /></MemoryRouter>);
  const card = within(screen.getByRole('region', { name: 'Why loops?' }));
  fireEvent.change(card.getByRole('textbox', { name: 'Answer content' }), { target: { value: 'Edited draft' } });
  fireEvent.change(card.getByLabelText('Review notes (optional)'), { target: { value: 'Looks good' } });
  fireEvent.click(card.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/answers/a1/approve', { content: 'Edited draft', reviewNotes: 'Looks good' }));
  fireEvent.click(card.getByRole('button', { name: 'Reject' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/answers/a1/reject', expect.any(Object)));
});
it('requires text before publishing a manual answer, then posts it', async () => {
  api.post.mockResolvedValue({});
  render(<MemoryRouter><TeacherReview /></MemoryRouter>);
  const card = within(screen.getByRole('region', { name: 'Heap help' }));
  fireEvent.click(card.getByRole('button', { name: 'Publish answer' }));
  expect(await card.findByRole('alert')).toHaveTextContent('Write an answer before publishing.');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(card.getByRole('textbox', { name: 'Answer content' }), { target: { value: 'A heap is a tree.' } });
  fireEvent.click(card.getByRole('button', { name: 'Publish answer' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/answers', { doubtId: 'd9', content: 'A heap is a tree.' }));
});
it('shows empty states when nothing needs review', () => {
  data['/answers?state=pending'] = { answers: [] };
  data['/doubts/failed'] = { doubts: [] };
  render(<MemoryRouter><TeacherReview /></MemoryRouter>);
  expect(screen.getByText('Nothing to review')).toBeInTheDocument();
  expect(screen.getByText('No questions need a manual answer')).toBeInTheDocument();
});

it('requires a topic, then creates the problem with the entered fields', async () => {
  api.post.mockResolvedValue({});
  render(<MemoryRouter><CreateProblem /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Echo' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Print the input.' } });
  fireEvent.change(screen.getByLabelText('Input format'), { target: { value: 'One line.' } });
  fireEvent.change(screen.getByLabelText('Output format'), { target: { value: 'The same line.' } });
  fireEvent.change(screen.getByLabelText('Constraints'), { target: { value: 'None' } });
  fireEvent.change(screen.getByLabelText('Example 1 input'), { target: { value: 'a' } });
  fireEvent.change(screen.getByLabelText('Example 1 output'), { target: { value: 'a' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create problem' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Select at least one topic.');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Select topics' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Arrays' }));
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Create problem' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/problems', expect.objectContaining({ title: 'Echo', topics: ['Arrays'] })));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/problems'));
});
it('keeps at least one example and test case', () => {
  render(<MemoryRouter><CreateProblem /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Remove example 1' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove test case 1' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Add test case' }));
  expect(screen.getByRole('button', { name: 'Remove test case 2' })).toBeEnabled();
});

it('marks appealed and low-confidence doubts for teachers', () => {
  data['/answers?state=pending'] = { answers: [{ _id: 'a1', source: 'ai', state: 'pending', content: 'Draft', doubtId: { title: 'Why loops?', body: 'x', appealed: true, triage: { lowConfidence: true } } }] };
  data['/doubts/failed'] = { doubts: [{ _id: 'd9', title: 'Heap help', body: 'y', aiDraftStatus: 'failed', appealed: true, triage: { lowConfidence: true }, studentId: { name: 'Sam' } }] };
  render(<MemoryRouter><TeacherReview /></MemoryRouter>);
  for (const name of ['Why loops?', 'Heap help']) {
    const card = within(screen.getByRole('region', { name }));
    expect(card.getByText('Appealed')).toBeInTheDocument();
    expect(card.getByText('Low confidence')).toBeInTheDocument();
  }
});
it('shows no marker on an ordinary doubt', () => {
  render(<MemoryRouter><TeacherReview /></MemoryRouter>);
  expect(screen.queryByText('Appealed')).not.toBeInTheDocument();
  expect(screen.queryByText('Low confidence')).not.toBeInTheDocument();
});

it('explains that an appealed doubt has no AI draft and is waiting for a human answer', () => {
  data['/answers?state=pending'] = { answers: [] };
  data['/doubts/failed'] = { doubts: [{ _id: 'd9', title: 'Heap help', body: 'y', aiDraftStatus: 'skipped', appealed: true, studentId: { name: 'Sam' } }] };
  render(<MemoryRouter><TeacherReview /></MemoryRouter>);
  const card = within(screen.getByRole('region', { name: 'Heap help' }));
  expect(card.getByText('Appealed')).toBeInTheDocument();
  expect(card.queryByText('Off topic')).not.toBeInTheDocument();
  expect(card.queryByText('AI draft failed')).not.toBeInTheDocument();
  expect(card.getByText(/No AI draft was made/)).toBeInTheDocument();
  expect(card.getByRole('button', { name: 'Publish answer' })).toBeInTheDocument();
});
