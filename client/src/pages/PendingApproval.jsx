import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import AuthCard from '../components/AuthCard.jsx';
import { Badge, Button, ErrorState, Skeleton } from '../components/ui/index.js';

const POLL_MS = 45000;

/**
 * Where a teacher applicant lands. It shows the status of the application, refreshed every 45 seconds while
 * the tab is visible and on request. When the admin approves, the applicant's sessions end; the next request
 * fails, they are sent to the login page with a note, and logging in again gives them the teacher account.
 * Everything typed by the applicant is shown as plain text.
 */
export default function PendingApproval() {
  const [application, setApplication] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const { data } = await api.get('/teacher-application');
      setApplication(data.application);
      setError('');
    } catch (err) {
      setError(err.response?.status === 404 ? 'We could not find your application.' : 'We could not check the status. Check your connection and try again.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(() => { if (!document.hidden) check(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [check]);

  const rejected = application?.status === 'rejected';
  return (
    <AuthCard
      title={rejected ? 'Application not approved' : 'Awaiting approval'}
      subtitle={rejected ? 'An administrator reviewed your teacher application and did not approve it.' : 'An administrator has to approve your teacher account before you can use it.'}
    >
      {!application && !error && <div role="status" aria-label="Loading your application" className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-16 w-full" /></div>}
      {error && <ErrorState message={error} onRetry={check} className="mb-4" />}
      {application && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-base">
            <span className="text-fg-muted">Status</span>
            <Badge tone={rejected ? 'danger' : 'warning'}>{rejected ? 'Rejected' : 'Pending review'}</Badge>
          </div>
          {rejected && application.decisionReason && (
            <div>
              <h2 className="text-sm font-medium">Reason</h2>
              <p className="mt-1 whitespace-pre-wrap break-words text-base text-fg-muted">{application.decisionReason}</p>
            </div>
          )}
          {!rejected && <p className="text-base text-fg-muted">You will get an email when a decision is made. Log in again after you are approved to start using your teacher account.</p>}
          <div>
            <h2 className="text-sm font-medium">Organization</h2>
            <p className="mt-1 whitespace-pre-wrap break-words text-base text-fg-muted">{application.organization}</p>
          </div>
          {application.note && (
            <div>
              <h2 className="text-sm font-medium">Your note</h2>
              <p className="mt-1 whitespace-pre-wrap break-words text-base text-fg-muted">{application.note}</p>
            </div>
          )}
          <Button onClick={check} loading={checking} className="w-full">Check status</Button>
        </div>
      )}
    </AuthCard>
  );
}
