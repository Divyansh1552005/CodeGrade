import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmitCode from './SubmitCode.jsx';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';

vi.mock('../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../components/CodeEditor.jsx', () => ({ default: ({ value, onChange }) => <textarea aria-label="Code editor" value={value} onChange={(e) => onChange(e.target.value)} /> }));
vi.mock('../components/ProblemStatement.jsx', () => ({ default: () => <p>Echo problem statement</p> }));
vi.mock('../components/Markdown.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
let submission;
let accepted;
const initial = () => ({ _id: 's1', problemId: 'p1', language: 'python', code: 'print(input())',
  status: 'queued', feedbackStatus: 'completed', passCount: 0, totalCount: 0, testResults: [], createdAt: new Date().toISOString() });
beforeEach(() => {
  vi.useFakeTimers(); invalidate(); accepted = false; submission = initial();
  api.get.mockReset().mockImplementation(async (url) => {
    if (url === '/problems') return { data: { problems: [{ _id: 'p1', title: 'Echo', starterCode: {} }] } };
    if (url.startsWith('/submissions?')) return { data: { submissions: accepted ? [structuredClone(submission)] : [] } };
    if (url === '/submissions/s1') return { data: { submission: structuredClone(submission) } };
    throw new Error(`Unexpected URL ${url}`);
  });
  api.post.mockReset().mockImplementation(async () => { accepted = true; return { data: { submissionId: 's1', submission: structuredClone(submission) } }; });
});
afterEach(() => { vi.useRealTimers(); invalidate(); });
async function showAndSubmit() {
  await act(async () => { render(<MemoryRouter initialEntries={['/submit/p1']}><Routes><Route path="/submit/:problemId" element={<SubmitCode />} /></Routes></MemoryRouter>); });
  fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'print(input())' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Run & Grade' })); });
}
const detailCalls = () => api.get.mock.calls.filter(([url]) => url === '/submissions/s1').length;

it('renders queued status, exposes test results before feedback, then stops polling on completion', async () => {
  await showAndSubmit();
  expect(screen.getByRole('button', { name: 'Grading…' })).toBeDisabled();
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
});
it('shows persisted grading errors, re-enables submitting and stops polling', async () => {
  await showAndSubmit();
  submission = { ...submission, status: 'error', error: 'Judge0 unavailable' };
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByRole('alert')).toHaveTextContent('Judge0 unavailable');
  expect(screen.getByRole('button', { name: 'Run & Grade' })).toBeEnabled();
  const count = detailCalls();
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(detailCalls()).toBe(count);
});
it('resumes pending history polling on a revisit', async () => {
  accepted = true;
  await act(async () => { render(<MemoryRouter initialEntries={['/submit/p1']}><Routes><Route path="/submit/:problemId" element={<SubmitCode />} /></Routes></MemoryRouter>); });
  expect(screen.getByText('queued')).toBeInTheDocument();
  submission = { ...submission, status: 'graded', feedbackStatus: 'completed', passCount: 1, totalCount: 1 };
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByText('1/1')).toBeInTheDocument();
});
