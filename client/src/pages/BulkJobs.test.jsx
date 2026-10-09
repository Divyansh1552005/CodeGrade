import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BulkJobs from './BulkJobs.jsx';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'teacher' } }) }));
vi.mock('../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => {
  invalidate(); api.get.mockReset(); api.post.mockReset();
  api.get.mockImplementation(async (url) => ({ data: url === '/jobs' ? { jobs: [] } : { job: { _id: 'job-1', type: 'problem-import', status: 'completed', result: { importedCount: 1 } } } }));
});
function show() { render(<MemoryRouter><BulkJobs /></MemoryRouter>); }

it('validates malformed JSON locally before starting a bulk job', async () => {
  show();
  fireEvent.change(screen.getByLabelText('Problem JSON'), { target: { value: '{broken' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import problems' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
it('submits a JSON problem array, fetches accepted job status and shows completion', async () => {
  api.post.mockResolvedValue({ data: { job: { _id: 'job-1', status: 'pending' } } });
  show();
  fireEvent.change(screen.getByLabelText('Problem JSON'), { target: { value: '[{"title":"Echo"}]' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import problems' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/jobs', { type: 'problem-import', problems: [{ title: 'Echo' }] }));
  expect(await screen.findByText('Imported 1 problems.')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/jobs/job-1');
});
it('shows a server validation or queue failure to the teacher', async () => {
  api.post.mockRejectedValue({ response: { data: { error: 'Please wait for your current bulk jobs to finish.' } } });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Export my problems' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please wait for your current bulk jobs to finish.');
});
