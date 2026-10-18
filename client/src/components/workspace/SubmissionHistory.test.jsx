import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SubmissionHistory from './SubmissionHistory.jsx';
import { usePagedList } from '../../api/usePagedList.js';
import { api } from '../../api/client.js';

vi.mock('../../api/client.js', () => ({ api: { get: vi.fn() } }));

const row = (id) => ({ _id: id, problemId: 'p1', problemTitle: 'Two sum', status: 'graded', passCount: 1, totalCount: 2, language: 'python', feedbackStatus: 'done', createdAt: new Date().toISOString() });
function Harness() {
  const list = usePagedList({ url: '/submissions?problemId=p1', itemsKey: 'submissions', syncUrl: false });
  const [openId, setOpenId] = useState(null);
  return <SubmissionHistory list={list} openId={openId} onOpenChange={setOpenId} />;
}
const renderHistory = () => render(<MemoryRouter><Harness /></MemoryRouter>);

beforeEach(() => {
  api.get.mockReset().mockImplementation(async (url) => {
    if (url === '/submissions/s2') return { data: { submission: { ...row('s2'), code: 'print(42)', testResults: [], aiFeedback: '' } } };
    if (url.includes('cursor=c1')) return { data: { submissions: [row('s3')], nextCursor: null, hasMore: false } };
    return { data: { submissions: [row('s1'), row('s2')], nextCursor: 'c1', hasMore: true } };
  });
});

it('lists light rows without fetching any code until a row is opened', async () => {
  renderHistory();
  await screen.findByRole('table', { name: 'Your submissions' });
  expect(api.get.mock.calls.map(([u]) => u)).toEqual(['/submissions?problemId=p1&limit=10']);
  const toggles = screen.getAllByRole('button', { expanded: false });
  fireEvent.click(toggles[1]);
  expect(await screen.findByText('print(42)')).toBeInTheDocument();
  expect(api.get.mock.calls.map(([u]) => u)).toContain('/submissions/s2');
});
it('keeps the opened row when moving to another page and back', async () => {
  renderHistory();
  await screen.findByRole('table', { name: 'Your submissions' });
  fireEvent.click(screen.getAllByRole('button', { expanded: false })[1]);
  await screen.findByText('print(42)');
  fireEvent.click(screen.getByRole('button', { name: 'Older submissions' }));
  await waitFor(() => expect(screen.queryByText('print(42)')).not.toBeInTheDocument());
  fireEvent.click(await screen.findByRole('button', { name: 'Back to the newest submissions' }));
  expect(await screen.findByText('print(42)')).toBeInTheDocument();
});
