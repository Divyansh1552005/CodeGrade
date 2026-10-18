import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../api/client.js';
import Register from './Register.jsx';
import PendingApproval from './PendingApproval.jsx';
import AdminLogin from './AdminLogin.jsx';
import Login from './Login.jsx';
import ProtectedRoute, { AdminRoute, ApplicantRoute } from '../components/ProtectedRoute.jsx';
import NotFound from './NotFound.jsx';

const navigate = vi.fn();
const auth = vi.hoisted(() => ({ user: null, loading: false, notice: '', login: vi.fn(), register: vi.fn() }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ ...auth, isAuthed: Boolean(auth.user) }) }));
vi.mock('../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../components/ui/index.js', async (orig) => await orig());

const httpError = (status, data = {}, headers = {}) => Object.assign(new Error('http'), { response: { status, data, headers } });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const tick = async (seconds) => { for (let i = 0; i < seconds; i += 1) await act(async () => { vi.advanceTimersByTime(1000); }); };

beforeEach(() => {
  navigate.mockClear(); auth.user = null; auth.loading = false; auth.notice = '';
  auth.login.mockReset(); auth.register.mockReset();
  api.get.mockReset().mockResolvedValue({ data: { emailVerification: false, passwordReset: false } });
  api.post.mockReset();
});
afterEach(() => { vi.useRealTimers(); document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove()); });

describe('signup account type', () => {
  const open = () => render(<MemoryRouter><Register /></MemoryRouter>);
  it('shows organization, degree, links and note, with counters and the approval notice, only for a teacher', () => {
    open();
    expect(screen.queryByLabelText('Organization')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Account type')).toHaveValue('student');
    type('Account type', 'teacher');
    expect(screen.getByText('Teacher accounts need approval from an administrator before they can be used.')).toBeInTheDocument();
    expect(screen.getAllByText('0/120')).toHaveLength(2); // organization and degree
    expect(screen.getByText('0/500')).toBeInTheDocument();
    type('Organization', 'Open University');
    type('About you and your experience (optional)', 'I teach algorithms');
    expect(screen.getByText('15/120')).toBeInTheDocument();
    expect(screen.getByLabelText('Highest degree or qualification')).toBeRequired();
    expect(screen.getByLabelText('Link to your degree certificate')).toHaveAttribute('type', 'url');
    expect(screen.getByText('18/500')).toBeInTheDocument();
    expect(screen.getByLabelText('Organization')).toHaveAttribute('maxlength', '120');
    expect(screen.getByLabelText('About you and your experience (optional)')).toHaveAttribute('maxlength', '500');
    expect(screen.getByRole('button', { name: 'Apply for a teacher account' })).toBeInTheDocument();
    type('Account type', 'student');
    expect(screen.queryByLabelText('Organization')).not.toBeInTheDocument();
  });
  it('sends accountType and the teacher fields, and never a role', async () => {
    auth.register.mockResolvedValue({ pending: true, email: 't@school.example' });
    open();
    type('Name', 'Tess'); type('Email', 't@school.example'); type('Password', 'secret1'); type('Account type', 'teacher');
    type('Organization', 'Open University'); type('About you and your experience (optional)', 'Hello');
    type('Highest degree or qualification', 'MSc Maths'); type('Link to your degree certificate', ' https://drive.google.com/file/d/1/view ');
    type('Proof link 1', 'https://example.org/cv.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Add another link' }));
    type('Proof link 2', '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Apply for a teacher account' }));
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith({ name: 'Tess', email: 't@school.example', password: 'secret1', accountType: 'teacher', organization: 'Open University', note: 'Hello', degree: 'MSc Maths', degreeLink: 'https://drive.google.com/file/d/1/view', proofLinks: ['https://example.org/cv.pdf'] }));
    expect(auth.register.mock.calls[0][0]).not.toHaveProperty('role');
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
  });
  it('sends no teacher fields for a student, and goes to the page that fits the account', async () => {
    auth.register.mockResolvedValue({ role: 'teacher_applicant' });
    open();
    type('Name', 'Sam'); type('Email', 's@x.com'); type('Password', 'secret1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith({ name: 'Sam', email: 's@x.com', password: 'secret1', accountType: 'student' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/pending-approval'));
  });
});

describe('proof links on signup', () => {
  it('allows three links at most and lets one be removed', () => {
    render(<MemoryRouter><Register /></MemoryRouter>);
    type('Account type', 'teacher');
    fireEvent.click(screen.getByRole('button', { name: 'Add another link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add another link' }));
    expect(screen.getByLabelText('Proof link 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add another link' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove proof link 3' }));
    expect(screen.queryByLabelText('Proof link 3')).not.toBeInTheDocument();
  });
});

describe('route guards', () => {
  const at = (path, user) => {
    auth.user = user;
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/dashboard" element={<ProtectedRoute><p>dashboard page</p></ProtectedRoute>} />
          <Route path="/review" element={<ProtectedRoute role="teacher"><p>review page</p></ProtectedRoute>} />
          <Route path="/pending-approval" element={<ApplicantRoute><p>pending page</p></ApplicantRoute>} />
          <Route path="/admin" element={<AdminRoute><p>admin area</p></AdminRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    );
  };
  it('sends a teacher applicant to the approval page from every product page', () => {
    at('/dashboard', { role: 'teacher_applicant' });
    expect(screen.getByText('pending page')).toBeInTheDocument();
  });
  it('sends the admin to /admin from the product pages', () => {
    at('/review', { role: 'admin' });
    expect(screen.getByText('admin area')).toBeInTheDocument();
  });
  it('keeps students out of teacher pages and lets teachers in', () => {
    at('/review', { role: 'student' });
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });
  it('shows the normal 404 page for /admin to a student, a teacher, an applicant and a signed-out visitor', () => {
    for (const user of [{ role: 'student' }, { role: 'teacher' }, { role: 'teacher_applicant' }, null]) {
      const { unmount } = at('/admin', user);
      expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
      expect(screen.queryByText('admin area')).not.toBeInTheDocument();
      unmount();
    }
  });
  it('shows the admin area to the admin, and keeps everyone else off the approval page', () => {
    at('/admin', { role: 'admin' });
    expect(screen.getByText('admin area')).toBeInTheDocument();
  });
  it('sends a student away from the approval page', () => {
    at('/pending-approval', { role: 'student' });
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });
});

describe('pending approval page', () => {
  const open = () => render(<MemoryRouter><PendingApproval /></MemoryRouter>);
  const application = (extra = {}) => ({ data: { application: { status: 'pending', organization: 'Open <b>University</b>', note: 'Line one\nLine two', ...extra } } });
  it('shows the status, what happens next, and the submitted details as plain text', async () => {
    api.get.mockResolvedValue(application());
    open();
    expect(await screen.findByRole('heading', { name: 'Awaiting approval' })).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByText(/You will get an email when a decision is made/)).toBeInTheDocument();
    expect(screen.getByText('Open <b>University</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText(/Line one/)).toBeInTheDocument();
  });
  it('shows the rejection and its reason', async () => {
    api.get.mockResolvedValue(application({ status: 'rejected', decisionReason: 'We could not confirm your school.' }));
    open();
    expect(await screen.findByRole('heading', { name: 'Application not approved' })).toBeInTheDocument();
    expect(screen.getByText('We could not confirm your school.')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });
  it('shows an error with a retry', async () => {
    api.get.mockRejectedValueOnce(new Error('Network Error'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not check the status');
    api.get.mockResolvedValue(application());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Pending review')).toBeInTheDocument();
  });
  it('checks again on request', async () => {
    api.get.mockResolvedValue(application());
    open();
    await screen.findByText('Pending review');
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });
  it('refreshes about every 45 seconds while the tab is visible, and not while it is hidden', async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(application());
    open();
    await act(async () => { await Promise.resolve(); });
    expect(api.get).toHaveBeenCalledTimes(1);
    await tick(45);
    expect(api.get).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    await tick(90);
    expect(api.get).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    await tick(45);
    expect(api.get).toHaveBeenCalledTimes(3);
  });
});

describe('login after the session was ended by the server', () => {
  it('tells a former applicant to log in again when they may have been approved', () => {
    auth.notice = 'applicant-ended';
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('If your application was approved, log in again');
  });
  it('shows a plain note for a suspended account and for an ended session', () => {
    auth.notice = 'suspended';
    const { unmount } = render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('This account is suspended.');
    unmount();
    auth.notice = 'ended';
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Your session ended. Log in again to continue.');
  });
  it('sends each kind of account to its own page after logging in', async () => {
    auth.login.mockResolvedValue({ role: 'admin' });
    render(<MemoryRouter><Login /></MemoryRouter>);
    type('Email', 'a@b.co'); type('Password', 'password123');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin'));
  });
});

describe('admin login page', () => {
  const open = () => render(<MemoryRouter><AdminLogin /></MemoryRouter>);
  const submit = () => { type('Email', 'boss@example.com'); type('Password', 'whatever-123'); fireEvent.click(screen.getByRole('button', { name: /^(Log in|Try again)/ })); };
  it('has no sign up or forgot password link, no authentication code field, and asks search engines to stay away', () => {
    open();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/forgot|sign up|code/i)).not.toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')?.content).toBe('noindex, nofollow');
    expect(document.title).toBe('Admin log in - CodeGrade');
  });
  it('logs in with scope admin and goes to /admin; Enter submits', async () => {
    auth.login.mockResolvedValue({ role: 'admin' });
    open();
    type('Email', ' boss@example.com '); type('Password', 'pw-123456');
    fireEvent.submit(screen.getByLabelText('Password').closest('form'));
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('boss@example.com', 'pw-123456', { scope: 'admin' }));
    expect(navigate).toHaveBeenCalledWith('/admin', { replace: true });
  });
  it('shows the same generic error for a wrong password, a student account and any refusal, and moves focus to it', async () => {
    auth.login.mockRejectedValue(httpError(401, { error: 'Invalid credentials' }));
    open();
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid email or password.');
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    expect(navigate).not.toHaveBeenCalled();
    auth.login.mockRejectedValue(httpError(403, { error: 'anything' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(auth.login).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });
  it('shows the too many attempts state and disables submit until Retry-After has passed', async () => {
    vi.useFakeTimers();
    auth.login.mockRejectedValue(httpError(429, { error: 'Too many attempts.' }, { 'retry-after': '3' }));
    open();
    type('Email', 'boss@example.com'); type('Password', 'whatever-123');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Log in' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Try again in a few minutes.');
    const button = screen.getByRole('button', { name: /Try again in 3s/ });
    expect(button).toBeDisabled();
    await tick(3);
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });
  it('does not submit twice while a request is running', async () => {
    let finish;
    auth.login.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    open();
    type('Email', 'boss@example.com'); type('Password', 'whatever-123');
    const form = screen.getByLabelText('Password').closest('form');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(auth.login).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ role: 'admin' }); });
  });
  it('goes straight to /admin when the admin is already signed in', () => {
    auth.user = { role: 'admin' };
    render(<MemoryRouter initialEntries={['/admin/login']}><Routes><Route path="/admin/login" element={<AdminLogin />} /><Route path="/admin" element={<p>admin area</p>} /></Routes></MemoryRouter>);
    expect(screen.getByText('admin area')).toBeInTheDocument();
    expect(within(document.body).queryByLabelText('Password')).not.toBeInTheDocument();
  });
  it('reports a network failure without claiming the password was wrong', async () => {
    auth.login.mockRejectedValue(new Error('Network Error'));
    open();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not log in. Check your connection');
  });
});
