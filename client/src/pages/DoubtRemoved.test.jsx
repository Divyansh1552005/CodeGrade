import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DoubtRemoved from './DoubtRemoved.jsx';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';

vi.mock('../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../components/Markdown.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));

let removed;
const doubt = (over = {}) => ({ id: 'd1', title: 'Dinner?', body: 'What should I cook?', status: 'auto_rejected', reason: 'This is about cooking, not programming.', offTopic: true, appealed: false, canAppeal: true, ...over });
beforeEach(() => {
  invalidate();
  removed = doubt();
  api.get.mockReset().mockImplementation(async () => {
    if (removed instanceof Error) throw removed;
    return { data: { doubt: removed } };
  });
  api.post.mockReset();
});
const show = () => render(<MemoryRouter initialEntries={['/doubts/d1/removed']}><Routes><Route path="/doubts/:id/removed" element={<DoubtRemoved />} /></Routes></MemoryRouter>);
const apiError = (status, error) => Object.assign(new Error(error), { response: { status, data: { error } } });

it('shows the reason, the original doubt and one appeal action', async () => {
  show();
  expect(await screen.findByRole('heading', { level: 1, name: 'Your doubt was marked off topic' })).toBeInTheDocument();
  expect(screen.getByText('Why it was marked off topic')).toBeInTheDocument();
  expect(screen.getByText('This is about cooking, not programming.')).toBeInTheDocument();
  expect(screen.getByText('What should I cook?')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Request teacher review' })).toHaveLength(1);
});
it('sends the appeal once and then shows that it was requested', async () => {
  api.post.mockImplementation(async () => { removed = doubt({ status: 'appealed', appealed: true, canAppeal: false }); return { data: {} }; });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Request teacher review' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/doubts/d1/appeal'));
  expect(await screen.findByRole('status')).toHaveTextContent('a teacher will answer it directly');
  expect(screen.queryByRole('button', { name: 'Request teacher review' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open the doubt' })).toHaveAttribute('href', '/doubts/d1');
  expect(api.post).toHaveBeenCalledTimes(1);
});
it('shows the confirmation instead of the button when the doubt was already appealed', async () => {
  removed = doubt({ status: 'appealed', appealed: true, canAppeal: false });
  show();
  expect(await screen.findByRole('status')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request teacher review' })).not.toBeInTheDocument();
});
it('shows the server message when an appeal fails, and keeps the button for another try', async () => {
  api.post.mockRejectedValue(apiError(500, 'Internal server error'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Request teacher review' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
  expect(screen.getByRole('button', { name: 'Request teacher review' })).toBeEnabled();
});
it('shows a neutral page for a doubt that is not the viewer\'s or not removed', async () => {
  removed = apiError(404, 'Doubt not found');
  show();
  expect(await screen.findByText('This page is not available')).toBeInTheDocument();
  expect(screen.queryByText('Why it was removed')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to doubts' })).toHaveAttribute('href', '/doubts');
});
it('shows other errors with a retry', async () => {
  removed = apiError(500, 'Request failed');
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(1));
});

it('uses "removed" wording for a doubt that was not about being off topic', async () => {
  removed = doubt({ offTopic: false, reason: 'This looks like spam.' });
  show();
  expect(await screen.findByRole('heading', { level: 1, name: 'Your doubt was removed' })).toBeInTheDocument();
  expect(screen.getByText('Why it was removed')).toBeInTheDocument();
});
