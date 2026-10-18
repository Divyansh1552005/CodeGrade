import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardList } from 'lucide-react';
import { api } from '../../api/client.js';
import { usePagedList } from '../../api/usePagedList.js';
import PagedSection from '../../components/PagedSection.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { announceCountsChanged } from '../../components/admin/usePendingCount.js';
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Table, TBody, Td, Textarea, Th, THead, Tabs, TabsList, TabsTrigger, TabsContent, Tr } from '../../components/ui/index.js';

const STATUSES = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];
const REASON_MAX = 240;
const tone = { pending: 'warning', approved: 'success', rejected: 'danger' };
const when = (value) => (value ? new Date(value).toLocaleDateString() : '');

/** One application: everything the applicant wrote, as plain text, with the decision buttons. */
function ApplicationDetail({ application, onClose, onDecided }) {
  const [confirming, setConfirming] = useState(null); // 'approve' | 'reject'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(kind) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/teacher-applications/${application._id}/${kind}`, kind === 'reject' && reason.trim() ? { reason: reason.trim() } : {});
      toast.success(kind === 'approve' ? `${application.name} is now a teacher.` : 'Application rejected.');
      announceCountsChanged();
      onDecided();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the decision. Try again.');
      if (err.response?.status === 409 || err.response?.status === 404) onDecided(); // someone decided it already: refresh the list
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  const canApprove = application.status !== 'approved';
  const canReject = application.status === 'pending';
  return (
    <>
      <Modal
        open={!confirming}
        onOpenChange={(open) => !open && onClose()}
        title={application.name}
        description={application.email}
        footer={(
          <>
            {canReject && <Button onClick={() => setConfirming('reject')} disabled={busy}>Reject</Button>}
            {canApprove && <Button variant="primary" onClick={() => setConfirming('approve')} disabled={busy}>Approve</Button>}
          </>
        )}
      >
        <dl className="space-y-4 text-base">
          <div><dt className="text-sm font-medium">Status</dt><dd className="mt-1"><Badge tone={tone[application.status]}>{application.status[0].toUpperCase() + application.status.slice(1)}</Badge></dd></div>
          <div><dt className="text-sm font-medium">Organization</dt><dd className="mt-1 whitespace-pre-wrap break-words text-fg-muted">{application.organization}</dd></div>
          <div><dt className="text-sm font-medium">Note</dt><dd className="mt-1 whitespace-pre-wrap break-words text-fg-muted">{application.note || 'No note.'}</dd></div>
          <div><dt className="text-sm font-medium">Submitted</dt><dd className="mt-1 text-fg-muted">{when(application.submittedAt)}</dd></div>
          {application.decisionReason && <div><dt className="text-sm font-medium">Reason given</dt><dd className="mt-1 whitespace-pre-wrap break-words text-fg-muted">{application.decisionReason}</dd></div>}
        </dl>
      </Modal>
      <ConfirmDialog
        open={confirming === 'approve'} onClose={() => setConfirming(null)} onConfirm={() => decide('approve')} busy={busy} danger={false}
        title={`Approve ${application.name}?`} confirmLabel="Approve"
        message="They become a teacher and are signed out everywhere, so they log in again to use the new role. They are told by email."
      />
      <Modal
        open={confirming === 'reject'} onOpenChange={(open) => !open && !busy && setConfirming(null)} busy={busy}
        title={`Reject ${application.name}?`}
        description="They keep an account with no access to teacher features, and are told by email. You can still approve it later."
        footer={(<><Button onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button><Button variant="danger" onClick={() => decide('reject')} loading={busy}>Reject application</Button></>)}
      >
        <Field label="Reason (optional, the applicant sees it)" hint={`${reason.length}/${REASON_MAX}`}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} rows={3} />
        </Field>
      </Modal>
    </>
  );
}

export default function Applications() {
  const [params, setParams] = useSearchParams();
  const status = STATUSES.some(([key]) => key === params.get('status')) ? params.get('status') : 'pending';
  const list = usePagedList({ url: `/admin/teacher-applications?status=${status}`, itemsKey: 'applications', param: 'page' });
  const [open, setOpen] = useState(null);
  const counts = list.meta?.counts;
  return (
    <>
      <PageHeader title="Teacher applications" description="Applicants appear here once they have verified their email." />
      <Tabs value={status} onValueChange={(next) => setParams({ status: next })}>
        <TabsList aria-label="Application status">
          {STATUSES.map(([key, label]) => <TabsTrigger key={key} value={key}>{label}{counts ? ` (${counts[key]})` : ''}</TabsTrigger>)}
        </TabsList>
        <TabsContent value={status} className="mt-4">
          <PagedSection
            id="applications" heading="Applications" hideHeading label="applications" list={list} skeletonColumns={4}
            empty={<EmptyState icon={ClipboardList} title={status === 'pending' ? 'No applications waiting' : `No ${status} applications`} description={status === 'pending' ? 'New teacher applications show up here after the applicant verifies their email.' : 'Nothing here yet.'} />}
          >
            {(items) => (
              <Table aria-label={`${status} applications`}>
                <THead><Tr className="hover:bg-transparent"><Th>Name</Th><Th>Email</Th><Th>Organization</Th><Th>Submitted</Th></Tr></THead>
                <TBody>
                  {items.map((application) => (
                    <Tr key={application._id}>
                      <Td className="max-w-48 truncate"><button type="button" className="max-w-full truncate rounded-sm text-left font-medium text-accent-text hover:underline" onClick={() => setOpen(application)} aria-label={`Open application from ${application.name}`}>{application.name}</button></Td>
                      <Td className="max-w-56 truncate text-fg-muted">{application.email}</Td>
                      <Td className="max-w-56 truncate">{application.organization}</Td>
                      <Td className="whitespace-nowrap text-fg-muted">{when(application.submittedAt)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </PagedSection>
        </TabsContent>
      </Tabs>
      {open && <ApplicationDetail application={open} onClose={() => setOpen(null)} onDecided={() => { setOpen(null); list.reload(); }} />}
    </>
  );
}
