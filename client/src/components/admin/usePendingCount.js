import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';

const EVENT = 'admin-counts-changed';
const POLL_MS = 60000;

/** Tell the admin shell that a decision was made, so its pending badge updates at once. */
export const announceCountsChanged = () => window.dispatchEvent(new Event(EVENT));

/**
 * Number of verified applications waiting for a decision, for the badge in the admin nav. Loaded with the
 * admin page, refreshed every 60 seconds while the tab is visible, and right after a decision. It only calls
 * the admin API: the admin never touches a student or teacher endpoint.
 */
export function usePendingCount() {
  const [count, setCount] = useState(null);
  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/teacher-applications?status=pending&limit=1');
      setCount(data.counts?.pending ?? 0);
    } catch { /* the badge simply stays as it was */ }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    window.addEventListener(EVENT, refresh);
    return () => { clearInterval(timer); window.removeEventListener(EVENT, refresh); };
  }, [refresh]);
  return count;
}
