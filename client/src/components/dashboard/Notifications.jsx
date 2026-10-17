import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Button, ErrorState, Panel, PanelBody, PanelHeader, Skeleton } from '../ui/index.js';

export default function Notifications({ query }) {
  const [readingId, setReadingId] = useState('');
  const [readError, setReadError] = useState('');
  const items = query.data?.notifications;

  async function markRead(id) {
    setReadingId(id); setReadError('');
    try { await api.patch(`/activity/notifications/${id}/read`); await query.refetch(); }
    catch { setReadError('Unable to mark this notification as read. Try again.'); }
    finally { setReadingId(''); }
  }

  return (
    <Panel aria-label="Notifications">
      <PanelHeader title="Notifications" />
      <PanelBody className="space-y-3">
        {(query.error || readError) && <ErrorState message={query.error || readError} onRetry={query.error ? query.refetch : undefined} />}
        {query.loading && !items && <div role="status" aria-label="Loading notifications" className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>}
        {items?.length === 0 && <p className="text-base text-fg-muted">You are up to date. Teacher-approved answers appear here.</p>}
        {items?.length > 0 && (
          <ul className="-my-2 divide-y divide-border">
            {items.map((notice) => (
              <li key={notice._id} className="flex items-center justify-between gap-3 py-2">
                <Link to={notice.href} className={notice.readAt ? 'min-w-0 rounded-sm text-base text-fg-muted hover:text-fg' : 'min-w-0 rounded-sm text-base font-medium hover:underline'}>
                  {!notice.readAt && <span className="sr-only">Unread: </span>}
                  {notice.message}
                </Link>
                {!notice.readAt && <Button variant="ghost" size="sm" loading={readingId === notice._id} disabled={Boolean(readingId)} onClick={() => markRead(notice._id)}>Mark read</Button>}
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
