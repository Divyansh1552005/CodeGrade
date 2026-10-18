import { useSearchParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { usePagedList } from '../../api/usePagedList.js';
import PagedSection from '../../components/PagedSection.jsx';
import { EmptyState, Field, PageHeader, Select, Table, TBody, Td, Th, THead, Tr } from '../../components/ui/index.js';

const ACTIONS = {
  'admin.bootstrapped': 'Admin created or promoted', 'admin.password_changed': 'Admin password changed', 'admin.demoted': 'Admin demoted',
  'admin.login': 'Admin logged in', 'admin.login_failed': 'Admin login failed',
  'teacher_application.submitted': 'Application submitted', 'teacher_application.verified': 'Application verified',
  'teacher_application.approved': 'Application approved', 'teacher_application.rejected': 'Application rejected',
  'role.changed': 'Role changed', 'user.suspended': 'User suspended', 'user.unsuspended': 'User unsuspended',
};
const show = (value) => Object.entries(value ?? {}).map(([k, v]) => `${k} ${v}`).join(', ');

/** What changed, as plain text: before to after, a note, and how many times a repeated failure happened. */
function details(entry) {
  const parts = [];
  if (entry.before || entry.after) parts.push(`${show(entry.before) || 'none'} to ${show(entry.after) || 'none'}`);
  if (entry.detail) parts.push(entry.detail);
  if (entry.count > 1) parts.push(`${entry.count} times`);
  if (entry.ip) parts.push(entry.ip);
  return parts.join(' / ');
}

export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const action = ACTIONS[params.get('action')] ? params.get('action') : '';
  const list = usePagedList({ url: `/admin/audit-log${action ? `?action=${encodeURIComponent(action)}` : ''}`, itemsKey: 'entries', param: 'page' });
  return (
    <>
      <PageHeader title="Audit log" description="A read-only record of admin and access events. Nothing here can be edited or removed." />
      <div className="mb-4 max-w-xs">
        <Field label="Action">
          <Select value={action} onChange={(e) => setParams(e.target.value ? { action: e.target.value } : {}, { replace: true })}>
            <option value="">All actions</option>
            {Object.entries(ACTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </Field>
      </div>
      <PagedSection
        id="audit" heading="Audit log" hideHeading label="entries" list={list} skeletonColumns={5}
        empty={<EmptyState icon={ScrollText} title="No entries" description="Events appear here as they happen." />}
      >
        {(items) => (
          <Table aria-label="Audit log">
            <THead><Tr className="hover:bg-transparent"><Th>When</Th><Th>Action</Th><Th>By</Th><Th>About</Th><Th>Details</Th></Tr></THead>
            <TBody>
              {items.map((entry) => (
                <Tr key={entry._id}>
                  <Td className="whitespace-nowrap text-fg-muted">{new Date(entry.lastAt || entry.createdAt).toLocaleString()}</Td>
                  <Td className="whitespace-nowrap">{ACTIONS[entry.action] ?? entry.action}</Td>
                  <Td className="max-w-48 truncate text-fg-muted">{entry.actorEmail || 'System'}</Td>
                  <Td className="max-w-48 truncate text-fg-muted">{entry.targetEmail || ''}</Td>
                  <Td className="max-w-72 truncate text-fg-muted" title={details(entry)}>{details(entry)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </PagedSection>
    </>
  );
}
