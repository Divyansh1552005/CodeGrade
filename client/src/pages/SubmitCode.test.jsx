import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmitCode from './SubmitCode.jsx';
import { api } from '../api/client.js';
import toast from 'react-hot-toast';
import { invalidate } from '../api/useCachedQuery.js';

vi.mock('../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../components/CodeEditor.jsx', () => ({ default: ({ value, onChange }) => <textarea aria-label="Code editor" value={value} onChange={(e) => onChange(e.target.value)} /> }));
vi.mock('../components/ProblemStatement.jsx', () => ({ default: () => <p>Echo problem statement</p> }));
vi.mock('../components/Markdown.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ isAuthed: true, user: { _id: 'u1', role: 'student' } }) }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
let submission;
let accepted;
const initial = () => ({ _id: 's1', problemId: 'p1', language: 'python', code: 'print(input())',
  status: 'queued', feedbackStatus: 'completed', passCount: 0, totalCount: 0, testResults: [], createdAt: new Date().toISOString() });
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); invalidate(); accepted = false; submission = initial();
  api.get.mockReset().mockImplementation(async (url) => {
    if (url === '/problems') return { data: { problems: [{ _id: 'p1', title: 'Echo', starterCode: { python: '# Python starter', javascript: '// JS starter' }, sampleCases: [{ input: '7', output: '7' }] }] } };
    if (url.startsWith('/submissions?')) return { data: { submissions: accepted ? [structuredClone(submission)] : [] } };
    if (url === '/problems/p1/hints') return { data: { messages: [], hintsUsed: 0, level: 1, acceptedMode: false, quota: { messagesLeft: 10, retryAfterSeconds: 0, resetAt: '2026-10-19T18:30:00.000Z' } } };
    if (url === '/submissions/s1') return { data: { submission: structuredClone(submission) } };
    throw new Error(`Unexpected URL ${url}`);
  });
  api.post.mockReset().mockImplementation(async () => { accepted = true; return { data: { submissionId: 's1', submission: structuredClone(submission) } }; });
});
afterEach(() => { vi.useRealTimers(); invalidate(); });
async function showAndSubmit() {
  await act(async () => { render(<MemoryRouter initialEntries={['/submit/p1']}><Routes><Route path="/submit/:problemId" element={<SubmitCode />} /></Routes></MemoryRouter>); });
  fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'print(input())' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit solution' })); });
}
// Radix tabs activate on mouse down.
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));
const detailCalls = () => api.get.mock.calls.filter(([url]) => url === '/submissions/s1').length;

it('renders queued status, exposes test results before feedback, then stops polling on completion', async () => {
  await showAndSubmit();
  expect(screen.getByRole('button', { name: 'Submit solution' })).toBeDisabled();
  expect(screen.getByText('Submission queued. Waiting for grading…')).toBeInTheDocument();
  submission = { ...submission, status: 'graded', feedbackStatus: 'pending', passCount: 1, totalCount: 1,
    testResults: [{ input: '7', expectedOutput: '7', actualOutput: '7', passed: true }] };
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByText('1/1 passed')).toBeInTheDocument();
  expect(screen.getByText('AI feedback is being prepared. Your test results are ready.')).toBeInTheDocument();
  submission = { ...submission, feedbackStatus: 'completed', aiFeedback: { summary: 'Clear and correct.', strengths: [], improvements: [], complexityNote: 'O(1)' } };
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByText('Clear and correct.')).toBeInTheDocument();
  const count = detailCalls();
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(detailCalls()).toBe(count);
  expect(toast.success).toHaveBeenCalledTimes(1);
  expect(toast.success).toHaveBeenCalledWith('Submission queued.', { id: 'submission-queued' });
});
it('shows persisted grading errors, re-enables submitting and stops polling', async () => {
  await showAndSubmit();
  submission = { ...submission, status: 'error', error: 'Judge0 unavailable' };
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByRole('alert')).toHaveTextContent('Judge0 unavailable');
  expect(screen.getByRole('button', { name: 'Submit solution' })).toBeEnabled();
  const count = detailCalls();
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(detailCalls()).toBe(count);
});
it('resumes pending history polling on a revisit', async () => {
  accepted = true;
  await act(async () => { render(<MemoryRouter initialEntries={['/submit/p1']}><Routes><Route path="/submit/:problemId" element={<SubmitCode />} /></Routes></MemoryRouter>); });
  openTab('Submissions');
  expect(screen.getByText('Queued')).toBeInTheDocument();
  submission = { ...submission, status: 'graded', feedbackStatus: 'completed', passCount: 1, totalCount: 1 };
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByText('1/1')).toBeInTheDocument();
});

it('loads starter code from a direct problem link and preserves independent language drafts', async () => {
  await act(async () => { render(<MemoryRouter initialEntries={['/submit/p1']}><Routes><Route path="/submit/:problemId" element={<SubmitCode />} /></Routes></MemoryRouter>); });
  expect(screen.getByLabelText('Code editor')).toHaveValue('# Python starter');
  fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'my Python solution' } });
  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'javascript' } });
  expect(screen.getByLabelText('Code editor')).toHaveValue('// JS starter');
  fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'my JS solution' } });
  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'python' } });
  expect(screen.getByLabelText('Code editor')).toHaveValue('my Python solution');
  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'javascript' } });
  expect(screen.getByLabelText('Code editor')).toHaveValue('my JS solution');
});
it('uses the public sample console without submitting or executing code', async () => {
  await act(async () => { render(<MemoryRouter initialEntries={['/submit/p1']}><Routes><Route path="/submit/:problemId" element={<SubmitCode />} /></Routes></MemoryRouter>); });
  openTab('Results');
  openTab('Testcases');
  expect(screen.getByText('Expected output')).toBeInTheDocument();
  expect(screen.getAllByText('7')).toHaveLength(2);
  expect(api.post).not.toHaveBeenCalled();
});

it('requires confirmation before replacing a solution with starter code', async () => {
  await act(async () => { render(<MemoryRouter initialEntries={['/submit/p1']}><Routes><Route path="/submit/:problemId" element={<SubmitCode />} /></Routes></MemoryRouter>); });
  fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'my solution' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByRole('dialog', { name: 'Reset your solution?' })).toBeInTheDocument();
  expect(screen.getByLabelText('Code editor')).toHaveValue('my solution');
  fireEvent.click(screen.getByRole('button', { name: 'Reset code' }));
  expect(screen.getByLabelText('Code editor')).toHaveValue('# Python starter');
});

it('links to a new doubt with the current problem preselected', async () => {
  await act(async () => { render(<MemoryRouter initialEntries={['/submit/p1']}><Routes><Route path="/submit/:problemId" element={<SubmitCode />} /></Routes></MemoryRouter>); });
  expect(screen.getByRole('link', { name: 'Ask a doubt' })).toHaveAttribute('href', '/doubts/new?problem=p1');
});

it('always has a Hints tab and opens the hint chat for this problem', async () => {
  await act(async () => { render(<MemoryRouter initialEntries={['/submit/p1']}><Routes><Route path="/submit/:problemId" element={<SubmitCode />} /></Routes></MemoryRouter>); });
  expect(screen.getByRole('tab', { name: 'Hints' })).toBeInTheDocument();
  await act(async () => { fireEvent.mouseDown(screen.getByRole('tab', { name: 'Hints' })); });
  expect(api.get).toHaveBeenCalledWith('/problems/p1/hints');
  expect(screen.getByText('Ask for a hint')).toBeInTheDocument();
  expect(screen.getByText('10 messages left today')).toBeInTheDocument();
});
