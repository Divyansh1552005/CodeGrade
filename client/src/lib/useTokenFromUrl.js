import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * For the pages opened from an email link. Reads `?token=` once, then removes it from the address bar
 * (history.replaceState, so it is not kept in history or a copied URL) and asks browsers not to send a
 * Referer from this page. The token is only ever sent to the API, never to analytics.
 */
export function useTokenFromUrl() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') || '');
  useEffect(() => {
    if (window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname);
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  return token;
}
