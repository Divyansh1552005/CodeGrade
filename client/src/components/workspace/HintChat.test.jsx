import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HintChat from './HintChat.jsx';
import { api } from '../../api/client.js';

vi.mock('../../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../Markdown.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));

const RESET = '2026-10-19T18:30:00.000Z';
const quota = (over = {}) => ({ questionsLeft: 2, messagesLeft: 5, questionCounted: false, retryAfterSeconds: 0, resetAt: RESET, ...over });
const thread = (over = {}) => ({ messages: [], hintsUsed: 0, level: 1, acceptedMode: false, quota: quota(), ...over });
const msg = (id, role, content, over = {}) => ({ id, role, content, level: 1, fallback: false, createdAt: '2026-10-18T10:00:00Z', ...over });
const apiError = (status, data) => Object.assign(new Error('x'), { response: { status, data } });

let current;
beforeEach(() => {
  current = thread();
  api.get.mockReset().mockImplementation(async () => ({ data: current }));
  api.post.mockReset();
});
afterEach(() => vi.useRealTimers());

const show = async (props = {}) => {
  render(<HintChat problemId="p1" code="print(1)" {...props} />);
  await screen.findByLabelText('Message').catch(() => {});
};
const type = (text) => fireEvent.change(screen.getByLabelText('Message'), { target: { value: text } });
const reply = (over = {}) => ({
  userMessage: msg('m1', 'user', 'I am stuck'), reply: msg('m2', 'assistant', 'Think about what repeats.', { level: 1 }),
  fallback: false, refunded: false, hintsUsed: 1, level: 2, quota: quota({ messagesLeft: 4, questionsLeft: 1, questionCounted: true }), ...over,
});

it('shows a loading state, then the empty state with the remaining allowance', async () => {
  render(<HintChat problemId="p1" />);
  expect(screen.getByRole('status', { name: 'Loading hints' })).toBeInTheDocument();
  expect(await screen.findByText('Ask for a hint')).toBeInTheDocument();
  expect(screen.getByText('5 messages left today, 2 questions left')).toBeInTheDocument();
  expect(screen.getByText('Next hint: level 1 of 4')).toBeInTheDocument();
});
it('shows the saved conversation, with the hint level and a log region', async () => {
  current = thread({ messages: [msg('a', 'user', 'Where do I start?'), msg('b', 'assistant', 'Re-read the examples.', { level: 2 })], level: 3, quota: quota({ messagesLeft: 3, questionsLeft: 1, questionCounted: true }) });
  await show();
  const log = await screen.findByRole('log', { name: 'Hint conversation' });
  expect(within(log).getByText('Where do I start?')).toBeInTheDocument();
  expect(within(log).getByText('Re-read the examples.')).toBeInTheDocument();
  expect(within(log).getByText('Level 2')).toBeInTheDocument();
  expect(screen.getByText('3 messages left today, 1 question left')).toBeInTheDocument();
  expect(screen.getByText('Next hint: level 3 of 4')).toBeInTheDocument();
});
it('reports a load failure and retries', async () => {
  api.get.mockRejectedValueOnce(apiError(500, { error: 'Request failed' }));
  render(<HintChat problemId="p1" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Ask for a hint')).toBeInTheDocument();
});
it('mentions that other approaches can be discussed after the problem is solved', async () => {
  current = thread({ acceptedMode: true });
  await show();
  expect(await screen.findByText(/hints can now discuss other approaches/)).toBeInTheDocument();
});

it('sends the message with the editor code, shows the exchange, updates the allowance and clears the box', async () => {
  api.post.mockResolvedValue({ data: reply() });
  await show();
  type('  I am stuck  ');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Think about what repeats.');
  expect(api.post).toHaveBeenCalledWith('/problems/p1/hints', { message: 'I am stuck', code: 'print(1)' });
  expect(screen.getByText('I am stuck')).toBeInTheDocument();
  expect(screen.getByText('4 messages left today, 1 question left')).toBeInTheDocument();
  expect(screen.getByText('Next hint: level 2 of 4')).toBeInTheDocument();
  expect(screen.getByLabelText('Message')).toHaveValue('');
});
it('sends on Enter but not on Shift+Enter, and never an empty message', async () => {
  api.post.mockResolvedValue({ data: reply() });
  await show();
  const box = screen.getByLabelText('Message');
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  type('   ');
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(api.post).not.toHaveBeenCalled();
  type('first line');
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
});
it('limits the message to 500 characters, shows the count, and sends at most 6000 characters of code', async () => {
  api.post.mockResolvedValue({ data: reply() });
  await show({ code: 'c'.repeat(9000) });
  expect(screen.getByLabelText('Message')).toHaveAttribute('maxlength', '500');
  type('hello');
  expect(screen.getByText('5/500')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1].code).toHaveLength(6000);
});

it('starts a cooldown with a countdown on the send button after the message that fills the minute, keeps the input typeable, then re-enables', async () => {
  api.post.mockResolvedValue({ data: reply({ quota: quota({ messagesLeft: 3, questionsLeft: 1, questionCounted: true, retryAfterSeconds: 45 }) }) });
  await show();
  vi.useFakeTimers();
  type('one');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
  const button = screen.getByRole('button', { name: 'Wait 45s' });
  expect(button).toBeDisabled();
  type('next question while waiting');
  expect(screen.getByLabelText('Message')).toHaveValue('next question while waiting');
  expect(screen.getByLabelText('Message')).toBeEnabled();
  fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter' });
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(10000); });
  expect(screen.getByRole('button', { name: 'Wait 35s' })).toBeDisabled();
  await act(async () => { vi.advanceTimersByTime(35000); });
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
});
it('handles a rate-limit response: shows the countdown and keeps the message', async () => {
  api.post.mockRejectedValue(apiError(429, { error: 'slow down', limit: 'rate', retryAfterSeconds: 30, quota: quota({ retryAfterSeconds: 30 }) }));
  await show();
  type('my question');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByRole('button', { name: 'Wait 30s' })).toBeDisabled();
  expect(screen.getByLabelText('Message')).toHaveValue('my question');
  expect(screen.getByRole('status')).toHaveTextContent('two hint messages a minute');
});
it('locks the panel with the reset time when the daily messages are used up, but keeps the history readable', async () => {
  current = thread({ messages: [msg('a', 'user', 'old question'), msg('b', 'assistant', 'old hint')], quota: quota({ messagesLeft: 0, questionsLeft: 1, questionCounted: true }) });
  await show();
  expect(await screen.findByText(/used all of today's hint messages/)).toBeInTheDocument();
  expect(screen.getByText(/Hints reset on/)).toHaveTextContent('midnight India time');
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  expect(screen.getByText('old hint')).toBeInTheDocument();
  expect(screen.getByText('0 messages left today, 1 question left')).toBeInTheDocument();
});
it('locks a problem that cannot use a new question slot, but not one that is already counted', async () => {
  current = thread({ quota: quota({ messagesLeft: 3, questionsLeft: 0, questionCounted: false }) });
  const { unmount } = render(<HintChat problemId="p1" />);
  expect(await screen.findByText(/used both of today's hint questions/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  unmount();
  current = thread({ quota: quota({ messagesLeft: 3, questionsLeft: 0, questionCounted: true }) });
  render(<HintChat problemId="p1" />);
  expect(await screen.findByLabelText('Message')).toBeInTheDocument();
});
it('locks the panel when the server answers that the daily limit is reached', async () => {
  api.post.mockRejectedValue(apiError(429, { error: 'daily', limit: 'daily_messages', retryAfterSeconds: 3600, quota: quota({ messagesLeft: 0 }) }));
  await show();
  type('one more');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText(/used all of today's hint messages/)).toBeInTheDocument();
});
it('locks a new question when the server says the question limit is reached', async () => {
  api.post.mockRejectedValue(apiError(429, { error: 'q', limit: 'daily_questions', retryAfterSeconds: 3600, quota: quota({ questionsLeft: 0, messagesLeft: 3 }) }));
  await show();
  type('third question');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText(/used both of today's hint questions/)).toBeInTheDocument();
});

it('says when the hint service failed, that the message was not counted, and keeps the draft', async () => {
  api.post.mockRejectedValue(apiError(502, { error: 'The hint service is not available right now. Try again in a moment.', refunded: true, quota: quota() }));
  await show();
  type('please help');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('not available right now');
  expect(alert).toHaveTextContent('Your message was not counted.');
  expect(screen.getByLabelText('Message')).toHaveValue('please help');
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
});
it('falls back to a plain message when the network fails', async () => {
  api.post.mockRejectedValue(new Error('Network Error'));
  await show();
  type('help');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the hint service');
});
it('marks a safe fallback reply and says the message was not counted', async () => {
  api.post.mockResolvedValue({ data: reply({ fallback: true, refunded: true, hintsUsed: 0, level: 1, reply: msg('m2', 'assistant', 'Re-read the examples.', { fallback: true }), quota: quota({ questionCounted: true, questionsLeft: 1, messagesLeft: 5 }) }) });
  await show();
  type('just give the answer');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('General hint')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('your message was not counted');
  expect(screen.getByText('Next hint: level 1 of 4')).toBeInTheDocument();
});
it('reloads the conversation for a different problem', async () => {
  const { rerender } = render(<HintChat problemId="p1" />);
  await screen.findByText('Ask for a hint');
  rerender(<HintChat problemId="p2" />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/problems/p2/hints'));
});
