import toast from 'react-hot-toast';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';
import CheckInbox from '../components/CheckInbox.jsx';
import { PASSWORD_HINT } from '../lib/password.js';
import { Button, ErrorState, Field, Input, Select } from '../components/ui/index.js';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(''); // set once the server asks the user to verify their email

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await register(form);
      if (result?.pending) { setPendingEmail(result.email); return; }
      toast.success('Account created.');
      navigate('/dashboard');
    } catch (err) {
      const message = err.response?.data?.error || 'Registration failed. Check your connection and try again.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (pendingEmail) {
    return <CheckInbox email={pendingEmail} onUseDifferentEmail={() => { setPendingEmail(''); setForm({ ...form, email: '' }); }} />;
  }

  return (
    <AuthCard title="Create account" footer={<>Have an account? <Link className="rounded-sm font-medium text-accent-text hover:underline" to="/login">Log in</Link></>}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Name">
          <Input autoComplete="name" value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Email">
          <Input value={form.email} onChange={set('email')} type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>
        <Field label="Password" hint={PASSWORD_HINT}>
          <Input value={form.password} onChange={set('password')} type="password" autoComplete="new-password" minLength={6} required />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={set('role')}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </Select>
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Create account</Button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthCard>
  );
}
