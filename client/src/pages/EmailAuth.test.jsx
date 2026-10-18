import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../api/client.js';
import { resetAuthConfigCache } from '../api/useAuthConfig.js';
import CheckInbox from '../components/CheckInbox.jsx';
import Login from './Login.jsx';
import Register from './Register.jsx';
import VerifyEmail from './VerifyEmail.jsx';
import ForgotPassword from './ForgotPassword.jsx';
import ResetPassword from './ResetPassword.jsx';

const navigate = vi.fn();
const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const httpError = (status, data = {}, headers = {}) => Object.assign(new Error('http'), { response: { status, data, headers } });
const deferred = () => { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const at = (path, element, route = path.split('?')[0]) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter>);
// The countdown re-arms a one second timer after every render, so it has to be stepped a second at a time.
const tick = async (seconds) => { for (let i = 0; i < seconds; i += 1) await act(async () => { vi.advanceTimersByTime(1000); }); };
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  navigate.mockClear(); auth.login.mockReset(); auth.register.mockReset();
  api.get.mockReset().mockResolvedValue({ data: { emailVerification: true, passwordReset: true } });
  api.post.mockReset().mockResolvedValue({ data: {} });
  resetAuthConfigCache();
});
afterEach(() => { vi.useRealTimers(); });

describe('check your inbox', () => {
  it('shows the address, starts a visible 60 second cooldown, and resends when it ends', async () => {
    vi.useFakeTimers();
    render(<MemoryRouter><CheckInbox email="ada@example.com" onUseDifferentEmail={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Resend email in 60s' });
    expect(button).toBeDisabled();
    await tick(1);
    expect(screen.getByRole('button', { name: 'Resend email in 59s' })).toBeDisabled();
    await tick(59);
    const ready = screen.getByRole('button', { name: 'Resend email' });
    expect(ready).toBeEnabled();
    await act(async () => { fireEvent.click(ready); });
    expect(api.post).toHaveBeenCalledWith('/auth/resend-verification', { email: 'ada@example.com' });
    expect(screen.getByRole('button', { name: 'Resend email in 60s' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('a new link is on its way');
  });
  it('lets the user go back to use a different email', () => {
    const back = vi.fn();
    render(<MemoryRouter><CheckInbox email="a@b.co" onUseDifferentEmail={back} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(back).toHaveBeenCalled();
  });
  it('shows the server message and restarts the countdown when the resend is rate limited', async () => {
    vi.useFakeTimers();
    api.post.mockRejectedValue(httpError(429, { error: 'Too many attempts. Try again in 5m.' }, { 'retry-after': '300' }));
    render(<MemoryRouter><CheckInbox email="a@b.co" onUseDifferentEmail={vi.fn()} /></MemoryRouter>);
    await tick(60);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resend email' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Try again in 5m.');
    expect(screen.getByRole('button', { name: 'Resend email in 300s' })).toBeDisabled();
  });
});

describe('signup', () => {
  it('shows the check your inbox screen instead of going to the dashboard when verification is needed', async () => {
    auth.register.mockResolvedValue({ pending: true, email: 's@x.com' });
    render(<MemoryRouter><Register /></MemoryRouter>);
    type('Name', 'Sam'); type('Email', 's@x.com'); type('Password', 'secret1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(await screen.findByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Name')).toHaveValue('Sam');
  });
});

describe('login', () => {
  const submit = (email = 'a@b.com') => {
    type('Email', email); type('Password', 'password123');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  };
  it('explains an unverified account and offers to resend the verification email', async () => {
    auth.login.mockRejectedValue(httpError(403, { error: 'Verify your email address before logging in.', code: 'EMAIL_NOT_VERIFIED' }));
    render(<MemoryRouter><Login /></MemoryRouter>);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Verify your email address before logging in.');
    fireEvent.click(await screen.findByRole('button', { name: 'Resend verification email' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/resend-verification', { email: 'a@b.com' }));
    expect(await screen.findByRole('button', { name: /Resend verification email in 60s/ })).toBeDisabled();
  });
  it('does not offer a resend for an ordinary failure', async () => {
    auth.login.mockRejectedValue(httpError(401, { error: 'Invalid credentials' }));
    render(<MemoryRouter><Login /></MemoryRouter>);
    submit();
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /Resend verification/ })).not.toBeInTheDocument();
  });
  it('links to forgot password only when the server has it on', async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    resetAuthConfigCache();
    api.get.mockResolvedValue({ data: { emailVerification: false, passwordReset: false } });
    render(<MemoryRouter><Login /></MemoryRouter>);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole('link', { name: 'Forgot password?' })).toHaveLength(1);
  });
});

describe('verify email page', () => {
  it('verifies once with the token, shows a loading state first, then a way to log in', async () => {
    const gate = deferred();
    api.post.mockReturnValue(gate.promise);
    at('/verify-email?token=abc', <VerifyEmail />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your link');
    gate.resolve({ data: {} });
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to log in' })).toHaveAttribute('href', '/login');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/auth/verify-email', { token: 'abc' });
  });
  it('removes the token from the address bar and asks for no Referer', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    window.history.pushState({}, '', '/verify-email?token=abc');
    at('/verify-email?token=abc', <VerifyEmail />);
    await screen.findByRole('heading', { name: 'Email verified' });
    expect(replace).toHaveBeenCalledWith(expect.anything(), '', '/verify-email');
    expect(window.location.search).toBe('');
    expect(document.head.querySelector('meta[name="referrer"]')?.content).toBe('no-referrer');
    replace.mockRestore();
  });
  it('shows a request-a-new-link form for an expired or used link', async () => {
    api.post.mockImplementation(async (url) => { if (url === '/auth/verify-email') throw httpError(400, { code: 'TOKEN_INVALID' }); return { data: {} }; });
    at('/verify-email?token=old', <VerifyEmail />);
    expect(await screen.findByRole('heading', { name: 'This link does not work' })).toBeInTheDocument();
    type('Email', 'ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/resend-verification', { email: 'ada@example.com' }));
    expect(await screen.findByRole('status')).toHaveTextContent('a new link is on its way');
    expect(screen.getByRole('button', { name: /Send a new link in 60s/ })).toBeDisabled();
  });
  it('treats a missing token as an invalid link without calling the server', () => {
    at('/verify-email', <VerifyEmail />);
    expect(screen.getByRole('heading', { name: 'This link does not work' })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('offers a retry when the server cannot be reached', async () => {
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    at('/verify-email?token=abc', <VerifyEmail />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not reach the server');
    api.post.mockResolvedValueOnce({ data: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
  });
});

describe('forgot password page', () => {
  it('shows the same confirmation after the request, and disables the button while it runs', async () => {
    const gate = deferred();
    api.post.mockReturnValue(gate.promise);
    at('/forgot-password', <ForgotPassword />);
    type('Email', 'ada@example.com');
    const send = screen.getByRole('button', { name: 'Send reset link' });
    fireEvent.click(send);
    await waitFor(() => expect(send).toBeDisabled());
    fireEvent.submit(send.closest('form')); // a second submit while busy does nothing
    expect(api.post).toHaveBeenCalledTimes(1);
    gate.resolve({ data: { message: 'x' } });
    expect(await screen.findByText('If an account exists for that email, we sent a reset link.')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'ada@example.com' });
  });
  it('shows a rate limit message, and an unreachable-server message, without a confirmation', async () => {
    api.post.mockRejectedValueOnce(httpError(429, { error: 'Too many attempts. Try again in 1h.' }));
    at('/forgot-password', <ForgotPassword />);
    type('Email', 'ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 1h.');
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server'));
    expect(screen.queryByText(/we sent a reset link/)).not.toBeInTheDocument();
  });
});

describe('reset password page', () => {
  const fill = (password, confirm = password) => { type('New password', password); type('Confirm new password', confirm); fireEvent.click(screen.getByRole('button', { name: 'Change password' })); };
  it('shows the rules hint and sends the token and new password once, then a way to log in', async () => {
    at('/reset-password?token=tok', <ResetPassword />);
    expect(screen.getByText('At least 6 characters, at most 72 bytes.')).toBeInTheDocument();
    fill('new-password-1');
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/reset-password', { token: 'tok', password: 'new-password-1' });
    expect(screen.getByRole('link', { name: 'Go to log in' })).toHaveAttribute('href', '/login');
  });
  it('validates length, bytes and confirmation before calling the server', async () => {
    at('/reset-password?token=tok', <ResetPassword />);
    fill('123');
    expect(await screen.findByText(/at least 6 characters/i, { selector: 'p.text-danger' })).toBeInTheDocument();
    fill('é'.repeat(37));
    expect(await screen.findByText(/at most 72 bytes/i, { selector: 'p.text-danger' })).toBeInTheDocument();
    fill('new-password-1', 'different');
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-describedby');
  });
  it('shows the expired link state with a way to request a new one', async () => {
    api.post.mockRejectedValue(httpError(400, { code: 'TOKEN_INVALID', error: 'This link is invalid or has expired.' }));
    at('/reset-password?token=old', <ResetPassword />);
    fill('new-password-1');
    expect(await screen.findByRole('heading', { name: 'This link does not work' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
  });
  it('shows an invalid link right away when there is no token, and keeps the form for a rejected password', async () => {
    at('/reset-password', <ResetPassword />);
    expect(screen.getByRole('heading', { name: 'This link does not work' })).toBeInTheDocument();
  });
  it('keeps the form and shows the server message when the password is refused', async () => {
    api.post.mockRejectedValue(httpError(400, { error: 'password: password must be at most 72 bytes' }));
    at('/reset-password?token=tok', <ResetPassword />);
    fill('new-password-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('password must be at most 72 bytes');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeEnabled();
  });
});
