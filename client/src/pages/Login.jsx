import toast from 'react-hot-toast';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';
import ResendVerification from '../components/ResendVerification.jsx';
import { useAuthConfig } from '../api/useAuthConfig.js';
import { homeFor } from '../components/ProtectedRoute.jsx';
import { Button, ErrorState, Field, Input } from '../components/ui/index.js';

export default function Login() {
  const { login, notice } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState(false); // the server answered EMAIL_NOT_VERIFIED
  const { passwordReset } = useAuthConfig();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setBusy(true);
    try {
      const signedIn = await login(email, password);
      toast.success('Welcome back.');
      navigate(homeFor(signedIn?.role));
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed. Check your connection and try again.';
      setError(message);
      setUnverified(err.response?.data?.code === 'EMAIL_NOT_VERIFIED');
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Log in" footer={<>No account? <Link className="rounded-sm font-medium text-accent-text hover:underline" to="/register">Sign up</Link></>}>
      {notice && (
        <p role="status" className="mb-4 rounded-sm border border-info-border bg-info-bg px-3 py-2 text-sm text-info">
          {notice === 'applicant-ended' ? 'Your session ended. If your application was approved, log in again to start using your teacher account.'
            : notice === 'suspended' ? 'This account is suspended.' : 'Your session ended. Log in again to continue.'}
        </p>
      )}
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>
        <Field label="Password">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
        </Field>
        {passwordReset && (
          <p className="-mt-2 text-sm"><Link className="rounded-sm font-medium text-accent-text hover:underline" to="/forgot-password">Forgot password?</Link></p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Log in</Button>
        {error && <ErrorState message={error} />}
        {unverified && <ResendVerification email={email.trim()} label="Resend verification email" />}
      </form>
    </AuthCard>
  );
}
