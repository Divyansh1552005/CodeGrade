import toast from 'react-hot-toast';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';
import ResendVerification from '../components/ResendVerification.jsx';
import { useAuthConfig } from '../api/useAuthConfig.js';
import { Button, ErrorState, Field, Input } from '../components/ui/index.js';

export default function Login() {
  const { login } = useAuth();
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
      await login(email, password);
      toast.success('Welcome back.');
      navigate('/dashboard');
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
