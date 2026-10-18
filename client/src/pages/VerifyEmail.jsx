import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import AuthCard from '../components/AuthCard.jsx';
import { Button, ErrorState, Field, Input, Spinner } from '../components/ui/index.js';
import { useTokenFromUrl } from '../lib/useTokenFromUrl.js';
import { useResendVerification } from '../api/useResendVerification.js';

// Asks for a new link when the one from the email is expired, used, or never worked.
function RequestNewLink() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { resend, busy, sent, error, remaining } = useResendVerification(submitted);
  const requested = useRef(false);
  useEffect(() => {
    if (submitted && !requested.current) { requested.current = true; resend(); }
  }, [submitted]); // eslint-disable-line react-hooks/exhaustive-deps -- send once per submit
  function onSubmit(e) {
    e.preventDefault();
    requested.current = false;
    setSubmitted(email.trim());
  }
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Field label="Email">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={remaining > 0}>
        {remaining > 0 ? `Send a new link in ${remaining}s` : 'Send a new link'}
      </Button>
      <p role="status" className="min-h-5 text-sm text-fg-muted">{sent && !error ? 'If that address has an account that is not verified yet, a new link is on its way.' : ''}</p>
      {error && <ErrorState message={error} />}
    </form>
  );
}

export default function VerifyEmail() {
  const token = useTokenFromUrl();
  const [state, setState] = useState(token ? 'verifying' : 'invalid'); // verifying | success | invalid | error
  const started = useRef(false);

  async function verify() {
    setState('verifying');
    try {
      await api.post('/auth/verify-email', { token });
      setState('success');
    } catch (err) {
      setState(err.response?.status === 400 || err.response?.status === 404 ? 'invalid' : 'error');
    }
  }
  useEffect(() => {
    if (!token || started.current) return; // the token is single use: never send it twice, even in StrictMode
    started.current = true;
    verify();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'verifying') {
    return (
      <AuthCard title="Verifying your email">
        <div role="status" className="flex items-center gap-3 text-base text-fg-muted"><Spinner />Checking your link</div>
      </AuthCard>
    );
  }
  if (state === 'success') {
    return (
      <AuthCard title="Email verified" subtitle="Your account is ready. Log in to continue.">
        <Button to="/login" variant="primary" size="lg" className="w-full">Go to log in</Button>
      </AuthCard>
    );
  }
  if (state === 'error') {
    return (
      <AuthCard title="Could not verify your email">
        <ErrorState message="We could not reach the server. Check your connection and try again." onRetry={verify} />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="This link does not work"
      subtitle="It may have expired or already been used. Enter your email and we will send a new one."
      footer={<>Already verified? <Link className="rounded-sm font-medium text-accent-text hover:underline" to="/login">Log in</Link></>}
    >
      <RequestNewLink />
    </AuthCard>
  );
}
