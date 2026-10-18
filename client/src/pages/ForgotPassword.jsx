import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import AuthCard from '../components/AuthCard.jsx';
import { Button, ErrorState, Field, Input } from '../components/ui/index.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setDone(true); // the same confirmation whether or not the account exists
    } catch (err) {
      const status = err.response?.status;
      setError(status === 429 ? (err.response.data?.error || 'Too many attempts. Try again later.')
        : status === 404 ? 'Password reset is not available right now.'
        : err.response ? 'We could not process that request. Try again in a moment.'
        : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const back = <Link className="rounded-sm font-medium text-accent-text hover:underline" to="/login">Back to log in</Link>;
  if (done) {
    return (
      <AuthCard title="Check your inbox" subtitle="If an account exists for that email, we sent a reset link." footer={back}>
        <p className="text-base text-fg-muted">The link expires soon and works once. Check your spam folder if you do not see it.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Reset your password" subtitle="Enter the email you signed up with." footer={back}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Send reset link</Button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthCard>
  );
}
