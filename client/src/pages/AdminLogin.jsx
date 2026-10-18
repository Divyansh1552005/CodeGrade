import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';
import { Button, ErrorState, Field, Input } from '../components/ui/index.js';
import { useCooldown } from '../lib/useCooldown.js';

/**
 * Plain page for the administrator, linked from nowhere and kept out of search engines. It uses the normal
 * login API with scope "admin": the server answers every failure the same way, so so does this page.
 */
export default function AdminLogin() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const wait = useCooldown(0);
  const errorRef = useRef(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  if (user?.role === 'admin') return <Navigate to="/admin" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (busy || wait.remaining > 0) return;
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password, { scope: 'admin' });
      navigate('/admin', { replace: true });
    } catch (err) {
      if (err.response?.status === 429) {
        wait.start(Math.max(1, Number(err.response.headers?.['retry-after']) || 60));
        setError('Too many attempts. Try again in a few minutes.');
      } else if (err.response && err.response.status < 500) {
        setError('Invalid email or password.'); // the same text for every refusal
      } else {
        setError('Could not log in. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Admin log in">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required />
        </Field>
        <Field label="Password">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={wait.remaining > 0}>
          {wait.remaining > 0 ? `Try again in ${wait.remaining}s` : 'Log in'}
        </Button>
        <div ref={errorRef} tabIndex={-1} className="outline-none">{error && <ErrorState message={error} />}</div>
      </form>
    </AuthCard>
  );
}
