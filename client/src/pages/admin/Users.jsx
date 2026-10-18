import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MoreHorizontal, Users as UsersIcon } from 'lucide-react';
import { api } from '../../api/client.js';
import { usePagedList } from '../../api/usePagedList.js';
import PagedSection from '../../components/PagedSection.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Qualifications from '../../components/admin/Qualifications.jsx';
import { Badge, Button, DropdownMenu, Modal, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, Field, Icon, Input, PageHeader, Select, Table, TBody, Td, Th, THead, Tr } from '../../components/ui/index.js';

const ROLE_LABEL = { student: 'Student', teacher: 'Teacher', teacher_applicant: 'Applicant', admin: 'Admin' };
const ROLE_TONE = { student: 'neutral', teacher: 'info', teacher_applicant: 'warning', admin: 'accent' };
const when = (value) => (value ? new Date(value).toLocaleDateString() : 'Never');

const COPY = {
  demote: (u) => ({ title: `Demote ${u.name} to student?`, label: 'Demote to student', message: 'Their sessions end right away and they lose teacher access. Answers they approved stay as they are.', success: 'Demoted to student.' }),
  suspend: (u) => ({ title: `Suspend ${u.name}?`, label: 'Suspend', message: 'They are signed out everywhere and cannot log in until you unsuspend the account.', success: 'Account suspended.' }),
  unsuspend: (u) => ({ title: `Unsuspend ${u.name}?`, label: 'Unsuspend', message: 'They can log in again.', success: 'Account unsuspended.', danger: false }),
};
const REQUEST = {
  demote: (u) => api.post(`/admin/users/${u._id}/role`, { role: 'student' }),
  suspend: (u) => api.post(`/admin/users/${u._id}/suspend`, {}),
  unsuspend: (u) => api.post(`/admin/users/${u._id}/unsuspend`, {}),
};

/** One account's details and, when they applied to teach, what they gave: degree, links and note. */
function UserProfile({ user, onClose }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    api.get(`/admin/users/${user._id}`).then(({ data }) => live && setState({ data })).catch(() => live && setState({ error: true }));
    return () => { live = false; };
  }, [user._id]);
  const { data } = state;
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={user.name} description={user.email}>
      {state.loading && <p className="text-base text-fg-muted">Loading...</p>}
      {state.error && <p role="alert" className="text-base">Could not load this profile.</p>}
      {data && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 text-base">
            <div><dt className="text-sm font-medium">Role</dt><dd className="mt-1">{ROLE_LABEL[data.user.role] ?? data.user.role}{data.user.legacy ? ' (Legacy)' : ''}</dd></div>
            <div><dt className="text-sm font-medium">Status</dt><dd className="mt-1">{data.user.status === 'suspended' ? 'Suspended' : 'Active'}</dd></div>
            <div><dt className="text-sm font-medium">Joined</dt><dd className="mt-1 text-fg-muted">{when(data.user.createdAt)}</dd></div>
            <div><dt className="text-sm font-medium">Last login</dt><dd className="mt-1 text-fg-muted">{when(data.user.lastLoginAt)}</dd></div>
          </dl>
          {data.application
            ? (<div><h3 className="mb-3 text-md font-semibold">Teacher application ({data.application.status})</h3><Qualifications application={data.application} />{data.application.decisionReason && <p className="mt-3 text-base text-fg-muted">Reason given: {data.application.decisionReason}</p>}</div>)
            : <p className="text-base text-fg-muted">No teacher application on record.</p>}
        </div>
      )}
    </Modal>
  );
}

function RowActions({ user, onAction }) {
  // The admin account is never changed from here, so its menu is disabled.
  const protectedRow = user.isAdmin;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" iconOnly aria-label={`Actions for ${user.name}`} disabled={protectedRow}><Icon as={MoreHorizontal} /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onAction('profile', user)}>View profile</DropdownMenuItem>
        {user.role === 'teacher' && <DropdownMenuItem onSelect={() => onAction('demote', user)}>Demote to student</DropdownMenuItem>}
        {user.status === 'active' ? <DropdownMenuItem onSelect={() => onAction('suspend', user)}>Suspend</DropdownMenuItem> : <DropdownMenuItem onSelect={() => onAction('unsuspend', user)}>Unsuspend</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Users() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const role = params.get('role') || '';
  const status = params.get('status') || '';
  const [search, setSearch] = useState(q);
  const [pending, setPending] = useState(null); // { action, user }
  const [busy, setBusy] = useState(false);

  // Filters live in the URL. Changing one starts again from the first page.
  const setFilter = (key, value) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    return next;
  }, { replace: true });
  useEffect(() => {
    if (search === q) return undefined;
    const timer = setTimeout(() => setFilter('q', search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps -- the search box drives the q filter

  const query = new URLSearchParams({ ...(q && { q }), ...(role && { role }), ...(status && { status }) }).toString();
  const list = usePagedList({ url: `/admin/users${query ? `?${query}` : ''}`, itemsKey: 'users', param: 'page' });

  async function confirm() {
    if (busy || !pending || pending.action === 'profile') return;
    setBusy(true);
    try {
      await REQUEST[pending.action](pending.user);
      toast.success(COPY[pending.action](pending.user).success);
      list.reload();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change the account. Try again.');
    } finally {
      setBusy(false);
      setPending(null);
    }
  }
  const copy = pending && pending.action !== 'profile' && COPY[pending.action](pending.user);
  return (
    <>
      <PageHeader title="Users" description="Search accounts, view what teachers applied with, demote teachers and suspend accounts." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Search"><Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" maxLength={100} /></Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setFilter('role', e.target.value)}>
            <option value="">All roles</option>
            {Object.entries(ROLE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option>
          </Select>
        </Field>
      </div>
      <PagedSection
        id="users" heading="Users" hideHeading label="users" list={list} skeletonColumns={6}
        empty={<EmptyState icon={UsersIcon} title="No users match" description="Try a different search or clear a filter." />}
      >
        {(items) => (
          <Table aria-label="Users">
            <THead><Tr className="hover:bg-transparent"><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Last login</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
            <TBody>
              {items.map((user) => (
                <Tr key={user._id}>
                  <Td className="max-w-48 truncate font-medium">{user.name}</Td>
                  <Td className="max-w-56 truncate text-fg-muted">{user.email}</Td>
                  <Td>
                    <span className="inline-flex flex-wrap gap-1">
                      <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role] ?? user.role}</Badge>
                      {user.legacy && <Badge tone="neutral">Legacy</Badge>}
                      {user.applicationStatus && <Badge tone={user.applicationStatus === 'rejected' ? 'danger' : 'warning'}>{user.applicationStatus === 'rejected' ? 'Rejected' : 'Pending'}</Badge>}
                    </span>
                  </Td>
                  <Td><Badge tone={user.status === 'suspended' ? 'danger' : 'success'}>{user.status === 'suspended' ? 'Suspended' : 'Active'}</Badge>{!user.emailVerified && <Badge tone="warning" className="ml-1">Unverified</Badge>}</Td>
                  <Td className="whitespace-nowrap text-fg-muted">{when(user.lastLoginAt)}</Td>
                  <Td><RowActions user={user} onAction={(action, target) => setPending({ action, user: target })} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </PagedSection>
      {pending?.action === 'profile' && <UserProfile key={pending.user._id} user={pending.user} onClose={() => setPending(null)} />}
      <ConfirmDialog
        open={Boolean(copy)} onClose={() => !busy && setPending(null)} onConfirm={confirm} busy={busy}
        title={copy?.title} message={copy?.message} confirmLabel={copy?.label} danger={copy?.danger ?? true}
      />
    </>
  );
}
