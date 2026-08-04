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

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // The access token lives in React state (single source of truth) — never in
  // localStorage/sessionStorage. The refresh token is an httpOnly cookie the
  // browser manages; on reload we re-derive the access token via silent refresh.
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true); // hydrating session on load

  // Mirror the token into a ref so the (non-React) axios interceptor can read
  // the latest value synchronously without a stale closure.
  const tokenRef = useRef(null);
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

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
        tokenRef.current = null;
        setAccessToken(null);
        setUser(null);
      },
    });
  }, []);

  // On mount, try a silent refresh (the httpOnly refresh cookie may still be
  // valid), then hydrate the user.
  useEffect(() => {
    (async () => {
      try {
        await refreshAccessToken(); // updates state via onRefreshed
        const { data } = await api.get('/auth/me');
        setUser(data.user);
      } catch {
        tokenRef.current = null;
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    tokenRef.current = data.accessToken;
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function register(payload) {
    const { data } = await api.post('/auth/register', payload);
    tokenRef.current = data.accessToken;
    setAccessToken(data.accessToken);
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
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, loading, login, register, logout, isAuthed: Boolean(user) }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
