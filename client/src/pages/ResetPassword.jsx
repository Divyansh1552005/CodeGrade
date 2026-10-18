import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import AuthCard from '../components/AuthCard.jsx';
import { Button, ErrorState, Field, Input } from '../components/ui/index.js';
import { useTokenFromUrl } from '../lib/useTokenFromUrl.js';
import { PASSWORD_HINT, passwordProblem } from '../lib/password.js';

export default function ResetPassword() {
  const token = useTokenFromUrl();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(token ? 'form' : 'invalid'); // form | success | invalid

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const problems = { password: passwordProblem(password), confirm: confirm !== password ? 'The passwords do not match.' : '' };
    setFieldError(problems);
    if (problems.password || problems.confirm) return;
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setState('success');
    } catch (err) {
      const status = err.response?.status;
      if (status === 400 && err.response.data?.code === 'TOKEN_INVALID') setState('invalid');
      else if (status === 404) setError('Password reset is not available right now.');
      else if (status === 400) setError(err.response.data?.error || 'That password cannot be used.');
      else if (status === 429) setError(err.response.data?.error || 'Too many attempts. Try again later.');
      else setError(err.response ? 'We could not change the password. Try again in a moment.' : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'success') {
    return (
      <AuthCard title="Password changed" subtitle="You were signed out everywhere. Log in with your new password.">
        <Button to="/login" variant="primary" size="lg" className="w-full">Go to log in</Button>
      </AuthCard>
    );
  }
  if (state === 'invalid') {
    return (
      <AuthCard title="This link does not work" subtitle="It may have expired or already been used. Reset links work once and expire quickly.">
        <Button to="/forgot-password" variant="primary" size="lg" className="w-full">Request a new link</Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" footer={<Link className="rounded-sm font-medium text-accent-text hover:underline" to="/login">Back to log in</Link>}>
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="New password" hint={PASSWORD_HINT} error={fieldError.password}>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirm new password" error={fieldError.confirm}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Change password</Button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthCard>
  );
}
