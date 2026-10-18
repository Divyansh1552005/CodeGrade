import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../api/client.js';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { cn } from '../lib/cn.js';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Icon, Skeleton } from './ui/index.js';

const POLL_MS = 45000;

/** Bell with an unread count. The count is polled every 45 seconds, only while the tab is visible. */
export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState('');
  const unread = useCachedQuery('/notifications/unread-count', { key: `unread:${user?._id}`, refetchInterval: POLL_MS, pauseWhenHidden: true });
  const list = useCachedQuery('/notifications?limit=10', { key: `notifications-list:${user?._id}`, enabled: open });
  const navigate = useNavigate();
  const count = unread.data?.unread ?? 0;
  const items = list.data?.notifications;

  async function refresh() {
    await Promise.all([unread.refetch(), list.refetch()]);
  }
  async function open_(notification) {
    setFailed('');
    try {
      if (!notification.readAt) { await api.patch(`/notifications/${notification.id}/read`); refresh(); }
    } catch {
      setFailed('Could not mark this as read.');
    }
    navigate(notification.link);
  }
  async function markAll() {
    setFailed('');
    try { await api.post('/notifications/read-all'); await refresh(); }
    catch { setFailed('Could not mark notifications as read. Try again.'); }
  }

  return (
    <DropdownMenu open={open} onOpenChange={(next) => { setOpen(next); if (next) unread.refetch(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" iconOnly className="relative" aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}>
          <Icon as={Bell} />
          {count > 0 && (
            <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-xs font-medium leading-none tabular-nums text-accent-fg">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={count === 0}><Icon as={CheckCheck} />Mark all read</Button>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {list.loading && !items && <div role="status" aria-label="Loading notifications" className="space-y-2 p-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>}
          {list.error && <p role="alert" className="p-3 text-sm text-danger">{list.error}</p>}
          {failed && <p role="alert" className="p-3 text-sm text-danger">{failed}</p>}
          {items?.length === 0 && <p className="p-3 text-base text-fg-muted">You are up to date.</p>}
          {items?.map((n) => (
            <DropdownMenuItem key={n.id} onSelect={() => open_(n)} className="h-auto flex-col items-start gap-0.5 py-2">
              <span className={cn('text-base', n.readAt ? 'text-fg-muted' : 'font-medium text-fg')}>
                {!n.readAt && <span className="sr-only">Unread: </span>}{n.title}
              </span>
              {n.body && <span className="line-clamp-2 text-sm text-fg-muted">{n.body}</span>}
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator className="my-0" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
