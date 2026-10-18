import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  api,
  refreshAccessToken,
  registerTokenAccessor,
  setAuthHandlers,
} from '../api/client.js';

import toast from 'react-hot-toast';
import { invalidate } from '../api/useCachedQuery.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // The access token lives in React state (single source of truth) — never in
  // localStorage/sessionStorage. The refresh token is an httpOnly cookie the
  // browser manages; on reload we re-derive the access token via silent refresh.
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true); // hydrating session on load
  // Why the session ended without the user asking (shown once on the login page).
  const [notice, setNotice] = useState('');
  const userRef = useRef(null);

  // Mirror the token into a ref so the (non-React) axios interceptor can read
  // the latest value synchronously without a stale closure.
  const tokenRef = useRef(null);
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Bridge the axios client to our state: how to read the token, and what to do
  // when it's refreshed or when auth is lost.
  useEffect(() => {
    registerTokenAccessor(() => tokenRef.current);
    setAuthHandlers({
      onRefreshed: (token) => {
        tokenRef.current = token; // sync for the immediate retry
        setAccessToken(token);
      },
      onLogout: () => {
        const previous = userRef.current;
        tokenRef.current = null;
        setAccessToken(null);
        invalidate();
        setUser(null);
        // A signed-in user whose session was ended by the server (a decision on their application, a role
        // change, a suspension) is told so on the login page instead of being dropped there silently.
        if (previous) setNotice(previous.role === 'teacher_applicant' ? 'applicant-ended' : 'ended');
      },
      onForbidden: handleForbidden,
    });
  }, []);

  // The server says this account may not do that. TEACHER_PENDING and FORBIDDEN_ROLE mean the stored role is
  // not the one this tab thinks: reload it, and the route guards move the user to the right page. A suspended
  // account is signed out with a message. Any other 403 is left to the page that asked, and never logs out.
  const forbidden = useRef(false);
  function handleForbidden(body) {
    if (forbidden.current) return;
    forbidden.current = true;
    const done = () => { forbidden.current = false; };
    if (body.code === 'ACCOUNT_SUSPENDED') {
      toast.error('This account is suspended.');
      tokenRef.current = null; setAccessToken(null); invalidate(); setUser(null); setNotice('suspended');
      done();
    } else if (body.code === 'TEACHER_PENDING' || body.code === 'FORBIDDEN_ROLE') {
      if (body.code === 'FORBIDDEN_ROLE') toast.error('Your access to that page changed.');
      api.get('/auth/me').then(({ data }) => setUser(data.user)).catch(() => {}).finally(done);
    } else done();
  }

  // On mount, try a silent refresh (the httpOnly refresh cookie may still be
  // valid), then hydrate the user.
  useEffect(() => {
    (async () => {
      try {
        await refreshAccessToken(); // updates state via onRefreshed
        const { data } = await api.get('/auth/me');
        invalidate();
        setUser(data.user);
      } catch {
        tokenRef.current = null;
        setAccessToken(null);
        invalidate();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email, password, { scope } = {}) {
    setNotice('');
    const { data } = await api.post('/auth/login', { email, password, ...(scope ? { scope } : {}) });
    tokenRef.current = data.accessToken;
    setAccessToken(data.accessToken);
    invalidate();
    setUser(data.user);
    return data.user;
  }

  async function register(payload) {
    const { data } = await api.post('/auth/register', payload);
    // With email verification on, signup answers 202 with no session: the user must verify first.
    if (!data.accessToken) return { pending: true, email: data.email || payload.email };
    setNotice('');
    tokenRef.current = data.accessToken;
    setAccessToken(data.accessToken);
    invalidate();
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore network/logout errors */
    }
    tokenRef.current = null;
    setAccessToken(null);
    invalidate();
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, loading, notice, login, register, logout, isAuthed: Boolean(user) }),
    [user, loading, notice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
