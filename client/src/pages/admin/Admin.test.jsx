import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import AppShell from '../../components/AppShell.jsx';
import Applications from './Applications.jsx';
import Users from './Users.jsx';
import AuditLog from './AuditLog.jsx';

const auth = vi.hoisted(() => ({ user: { _id: 'u1', name: 'Boss', role: 'admin' }, logout: vi.fn() }));
vi.mock('../../auth/AuthContext.jsx', () => ({ useAuth: () => ({ ...auth, isAuthed: Boolean(auth.user), loading: false }) }));
vi.mock('../../theme/ThemeContext.jsx', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const Where = () => <output data-testid="where">{useLocation().pathname}{useLocation().search}</output>;
const urls = () => api.get.mock.calls.map(([url]) => url);
const httpError = (status, data = {}) => Object.assign(new Error('http'), { response: { status, data } });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

const application = (id, extra = {}) => ({ _id: id, userId: `user-${id}`, name: `Applicant ${id}`, email: `${id}@school.example`, status: 'pending', organization: `Org <b>${id}</b>`, note: 'First line\nSecond line', submittedAt: '2026-10-01T10:00:00Z', decisionReason: '', ...extra });
const appPage = (items, extra = {}) => ({ data: { applications: items, nextCursor: null, hasMore: false, counts: { pending: items.length, approved: 2, rejected: 1 }, ...extra } });

beforeEach(() => {
  auth.user = { _id: 'u1', name: 'Boss', role: 'admin' };
  api.get.mockReset().mockResolvedValue({ data: { counts: { pending: 0 } } });
  api.post.mockReset().mockResolvedValue({ data: {} });
  toast.error.mockClear(); toast.success.mockClear();
});

describe('admin shell', () => {
  it('calls only admin endpoints: no notifications, features, activity, doubts, problems or submissions', async () => {
    api.get.mockResolvedValue({ data: { counts: { pending: 3 } } });
    render(<MemoryRouter initialEntries={['/admin/users']}><AppShell /><Routes><Route path="*" element={<Users />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Applications/ })).toBeInTheDocument();
    await waitFor(() => expect(urls().length).toBeGreaterThan(1));
    const forbidden = urls().filter((url) => /^\/(notifications|features|activity|doubts|problems|submissions|leaderboard|answers|jobs)/.test(url));
    expect(forbidden).toEqual([]);
    expect(urls().every((url) => url.startsWith('/admin/'))).toBe(true);
  });
  it('has the three admin pages and a pending count on Applications', async () => {
    api.get.mockResolvedValue({ data: { counts: { pending: 3 }, users: [], hasMore: false } });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Admin navigation' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent.replace(/\d+$/, ''))).toEqual(['Applications', 'Users', 'Audit log']);
    expect(await within(nav).findByLabelText('3 waiting')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });
  it('gives a teacher applicant a header with no navigation and makes no request at all', () => {
    auth.user = { _id: 'u2', name: 'Tess', role: 'teacher_applicant' };
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('applications queue', () => {
  const open = (path = '/admin/applications') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/applications" element={<Applications />} /></Routes><Where /></MemoryRouter>);
  it('lists applicants with tabs and counts, an empty state, and an error with a retry', async () => {
    api.get.mockResolvedValue(appPage([application('a1'), application('a2')]));
    open();
    const table = await screen.findByRole('table', { name: 'pending applications' });
    expect(within(table).getByText('Applicant a1')).toBeInTheDocument();
    expect(within(table).getByText('Org <b>a1</b>')).toBeInTheDocument(); // plain text
    expect(screen.getByRole('tab', { name: 'Pending (2)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Approved (2)' })).toBeInTheDocument();
    expect(urls()[0]).toBe('/admin/teacher-applications?status=pending&limit=10');
  });
  it('shows an empty state and a retryable error', async () => {
    api.get.mockResolvedValueOnce(appPage([])).mockRejectedValueOnce(new Error('boom'));
    const { unmount } = open();
    expect(await screen.findByText('No applications waiting')).toBeInTheDocument();
    unmount();
    open();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    api.get.mockResolvedValue(appPage([application('a1')]));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Applicant a1')).toBeInTheDocument();
  });
  it('switches tabs, keeping the choice in the URL', async () => {
    api.get.mockResolvedValue(appPage([application('a1')]));
    open();
    await screen.findByText('Applicant a1');
    api.get.mockResolvedValue(appPage([application('r1', { status: 'rejected' })]));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Rejected/ }), { button: 0 });
    expect(await screen.findByText('Applicant r1')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('status=rejected');
  });
  it('shows the degree and proof links as text, linking only https ones safely', async () => {
    api.get.mockResolvedValue(appPage([application('a1', { degree: 'MSc <b>Maths</b>', degreeLink: 'https://drive.google.com/file/d/1/view', proofLinks: ['https://example.org/cv.pdf', 'javascript:alert(1)'] })]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Open application from Applicant a1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('MSc <b>Maths</b>')).toBeInTheDocument();
    const good = within(dialog).getByRole('link', { name: 'https://drive.google.com/file/d/1/view' });
    expect(good).toHaveAttribute('target', '_blank');
    expect(good.getAttribute('rel')).toContain('noopener');
    expect(within(dialog).getByRole('link', { name: 'https://example.org/cv.pdf' })).toBeInTheDocument();
    expect(within(dialog).getByText('javascript:alert(1)').closest('a')).toBeNull();
  });
  it('has Approve and Reject buttons on each pending row that go straight to the confirmation', async () => {
    api.get.mockResolvedValue(appPage([application('a1')]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Applicant a1' }));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/become a teacher/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/teacher-applications/a1/approve', {}));
  });
  it('opens an application, shows the whole note as text, and approves after a confirmation that says what happens', async () => {
    api.get.mockResolvedValue(appPage([application('a1')]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Open application from Applicant a1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/First line/)).toHaveTextContent('Second line');
    expect(within(dialog).getByText('a1@school.example')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    const confirm = await screen.findByRole('dialog');
    expect(confirm).toHaveTextContent('They become a teacher and are signed out everywhere');
    const gate = deferred();
    api.post.mockReturnValue(gate.promise);
    const button = within(confirm).getByRole('button', { name: 'Approve' });
    fireEvent.click(button); fireEvent.click(button);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/admin/teacher-applications/a1/approve', {});
    api.get.mockResolvedValue(appPage([]));
    gate.resolve({ data: {} });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Applicant a1 is now a teacher.'));
    expect(await screen.findByText('No applications waiting')).toBeInTheDocument();
  });
  it('rejects with an optional reason, shows a counter, and sends the reason', async () => {
    api.get.mockResolvedValue(appPage([application('a1')]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Open application from Applicant a1' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('0/240')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Not a school' } });
    expect(within(dialog).getByText('12/240')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject application' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/teacher-applications/a1/reject', { reason: 'Not a school' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Application rejected.'));
  });
  it('rejects without a reason by sending no body fields', async () => {
    api.get.mockResolvedValue(appPage([application('a1')]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Open application from Applicant a1' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reject' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reject application' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/teacher-applications/a1/reject', {}));
  });
  it('offers only Approve on a rejected application, and nothing on an approved one', async () => {
    api.get.mockResolvedValue(appPage([application('r1', { status: 'rejected', decisionReason: 'Unclear' })]));
    const { unmount } = open('/admin/applications?status=rejected');
    fireEvent.click(await screen.findByRole('button', { name: 'Open application from Applicant r1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Unclear')).toBeInTheDocument();
    unmount();
    api.get.mockResolvedValue(appPage([application('p1', { status: 'approved' })]));
    open('/admin/applications?status=approved');
    fireEvent.click(await screen.findByRole('button', { name: 'Open application from Applicant p1' }));
    const approved = await screen.findByRole('dialog');
    expect(within(approved).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(within(approved).queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
  it('shows the server message and refreshes the list when someone else already decided', async () => {
    api.get.mockResolvedValue(appPage([application('a1')]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Open application from Applicant a1' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }));
    api.post.mockRejectedValue(httpError(409, { error: 'This application is already approved.' }));
    api.get.mockResolvedValue(appPage([]));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This application is already approved.'));
    expect(await screen.findByText('No applications waiting')).toBeInTheDocument();
  });
});

describe('users table', () => {
  const user = (id, extra = {}) => ({ _id: id, name: `User ${id}`, email: `${id}@x.com`, role: 'student', emailVerified: true, status: 'active', legacy: false, isAdmin: false, createdAt: '2026-01-01T00:00:00Z', lastLoginAt: null, ...extra });
  const usersPage = (items, extra = {}) => ({ data: { users: items, nextCursor: null, hasMore: false, ...extra } });
  const open = (path = '/admin/users') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/users" element={<Users />} /></Routes><Where /></MemoryRouter>);
  it('shows role badges, the Legacy marker and applicant status, and disables actions on the admin row', async () => {
    api.get.mockResolvedValue(usersPage([
      user('admin', { role: 'admin', isAdmin: true, name: 'Boss' }), user('old', { role: 'teacher', legacy: true }), user('new', { role: 'teacher' }),
      user('ap', { role: 'teacher_applicant', applicationStatus: 'rejected' }), user('sus', { status: 'suspended' }),
    ]));
    open();
    const table = await screen.findByRole('table', { name: 'Users' });
    const row = (name) => within(table).getByText(name).closest('tr');
    expect(within(row('User old')).getByText('Legacy')).toBeInTheDocument();
    expect(within(row('User new')).queryByText('Legacy')).not.toBeInTheDocument();
    expect(within(row('User ap')).getByText('Applicant')).toBeInTheDocument();
    expect(within(row('User ap')).getByText('Rejected')).toBeInTheDocument();
    expect(within(row('User sus')).getByText('Suspended')).toBeInTheDocument();
    expect(within(row('Boss')).getByRole('button', { name: 'Actions for Boss' })).toBeDisabled();
    expect(within(row('User old')).getByRole('button', { name: 'Actions for User old' })).toBeEnabled();
  });
  it('demotes a teacher after a confirmation that says sessions end and approved answers stay', async () => {
    api.get.mockResolvedValue(usersPage([user('t1', { role: 'teacher' })]));
    open();
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Actions for User t1' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Demote to student' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Their sessions end right away');
    expect(dialog).toHaveTextContent('Answers they approved stay');
    const button = within(dialog).getByRole('button', { name: 'Demote to student' });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/users/t1/role', { role: 'student' }));
    expect(api.post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Demoted to student.'));
  });
  it('offers Suspend for an active account and Unsuspend for a suspended one, but no demotion for a student', async () => {
    api.get.mockResolvedValue(usersPage([user('s1'), user('s2', { status: 'suspended' })]));
    open();
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Actions for User s1' }), { key: 'Enter' });
    expect(await screen.findByRole('menuitem', { name: 'Suspend' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Demote to student' })).not.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Suspend' })).not.toBeInTheDocument());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for User s2' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unsuspend' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Unsuspend' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/users/s2/unsuspend', {}));
  });
  it('shows the server message when an action is refused', async () => {
    api.get.mockResolvedValue(usersPage([user('s1')]));
    api.post.mockRejectedValue(httpError(409, { error: 'The admin account cannot be changed.' }));
    open();
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Actions for User s1' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The admin account cannot be changed.'));
  });
  it('keeps search, role and status in the URL, and starts again from the first page when one changes', async () => {
    api.get.mockResolvedValue(usersPage([user('s1')], { nextCursor: 'c1', hasMore: true }));
    open('/admin/users?role=teacher&status=active&page=c9');
    await screen.findByRole('table', { name: 'Users' });
    expect(urls()[0]).toBe('/admin/users?role=teacher&status=active&limit=10&cursor=c9');
    expect(screen.getByLabelText('Role')).toHaveValue('teacher');
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'student' } });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('role=student'));
    expect(screen.getByTestId('where').textContent).not.toContain('page=');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'ali' } });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('q=ali'), { timeout: 2000 });
    await waitFor(() => expect(urls().some((u) => u.includes('q=ali') && u.includes('role=student'))).toBe(true));
  });
  it('opens a profile with the degree and links from the menu, and says so when there is no application', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/admin/users/t1') return { data: { user: { _id: 't1', role: 'teacher', status: 'active', legacy: false, createdAt: '2026-01-01T00:00:00Z', lastLoginAt: null }, application: { status: 'approved', organization: 'Open University', degree: 'MSc Maths', degreeLink: 'https://example.com/d.pdf', proofLinks: ['https://example.org/cv'], note: 'Ten years.', decisionReason: '' } } };
      if (url === '/admin/users/s1') return { data: { user: { _id: 's1', role: 'student', status: 'active', legacy: false, createdAt: '2026-01-01T00:00:00Z', lastLoginAt: null }, application: null } };
      return usersPage([user('t1', { role: 'teacher' }), user('s1')]);
    });
    open();
    await screen.findByText('User t1');
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Actions for User t1' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'View profile' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('MSc Maths')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'https://example.com/d.pdf' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'https://example.org/cv' })).toBeInTheDocument();
    expect(within(dialog).getByText('Ten years.')).toBeInTheDocument();
  });
  it('pages with Older and Newer', async () => {
    api.get.mockImplementation(async (url) => (url.includes('cursor=c1') ? usersPage([user('s2')]) : usersPage([user('s1')], { nextCursor: 'c1', hasMore: true })));
    open();
    await screen.findByText('User s1');
    fireEvent.click(screen.getByRole('button', { name: 'Older users' }));
    expect(await screen.findByText('User s2')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('page=c1');
  });
  it('shows an empty state when nothing matches', async () => {
    api.get.mockResolvedValue(usersPage([]));
    open('/admin/users?q=zzz');
    expect(await screen.findByText('No users match')).toBeInTheDocument();
  });
});

describe('audit log page', () => {
  const entry = (id, extra = {}) => ({ _id: id, action: 'role.changed', actorEmail: 'boss@example.com', targetEmail: 't@x.com', before: { role: 'student' }, after: { role: 'teacher' }, createdAt: '2026-10-01T10:00:00Z', ...extra });
  const open = (path = '/admin/audit-log') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/audit-log" element={<AuditLog />} /></Routes><Where /></MemoryRouter>);
  it('is read-only: entries as text, with before and after, and no buttons that change anything', async () => {
    api.get.mockResolvedValue({ data: { entries: [entry('e1'), entry('e2', { action: 'admin.login_failed', before: undefined, after: undefined, actorEmail: undefined, count: 4, ip: '10.0.0.1', detail: 'wrong password' })], nextCursor: null, hasMore: false } });
    open();
    const table = await screen.findByRole('table', { name: 'Audit log' });
    expect(within(table).getByText('Role changed')).toBeInTheDocument();
    expect(within(table).getByText('role student to role teacher')).toBeInTheDocument();
    expect(within(table).getByText('wrong password / 4 times / 10.0.0.1')).toBeInTheDocument();
    expect(within(table).getByText('System')).toBeInTheDocument();
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  });
  it('filters by action, in the URL', async () => {
    api.get.mockResolvedValue({ data: { entries: [entry('e1')], nextCursor: null, hasMore: false } });
    open();
    await screen.findByRole('table', { name: 'Audit log' });
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'user.suspended' } });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('action=user.suspended'));
    await waitFor(() => expect(urls().some((u) => u.startsWith('/admin/audit-log?action=user.suspended'))).toBe(true));
  });
  it('shows an empty state', async () => {
    api.get.mockResolvedValue({ data: { entries: [], nextCursor: null, hasMore: false } });
    open();
    expect(await screen.findByText('No entries')).toBeInTheDocument();
  });
});

describe('admin paging', () => {
  const user = (id) => ({ _id: id, name: `User ${id}`, email: `${id}@x.com`, role: 'student', emailVerified: true, status: 'active', legacy: false, isAdmin: false, createdAt: '2026-01-01T00:00:00Z', lastLoginAt: null });
  const chain = (url) => {
    const page = url.includes('cursor=c2') ? { users: [user('s3')], nextCursor: null } : url.includes('cursor=c1') ? { users: [user('s2')], nextCursor: 'c2' } : { users: [user('s1')], nextCursor: 'c1' };
    return { data: { ...page, hasMore: Boolean(page.nextCursor) } };
  };
  it('walks Older twice, then Newer once, then Newest back to the first page', async () => {
    api.get.mockImplementation(async (url) => chain(url));
    render(<MemoryRouter initialEntries={['/admin/users']}><Routes><Route path="/admin/users" element={<Users />} /></Routes><Where /></MemoryRouter>);
    await screen.findByText('User s1');
    expect(screen.getByRole('button', { name: 'Newer users' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Back to the newest users' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Older users' }));
    await screen.findByText('User s2');
    fireEvent.click(screen.getByRole('button', { name: 'Older users' }));
    await screen.findByText('User s3');
    expect(screen.getByRole('button', { name: 'Older users' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Newer users' }));
    await screen.findByText('User s2');
    expect(screen.getByTestId('where')).toHaveTextContent('page=c1');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the newest users' }));
    await screen.findByText('User s1');
    expect(screen.getByTestId('where').textContent).not.toContain('page=');
  });
});
