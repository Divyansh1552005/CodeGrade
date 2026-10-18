import toast from 'react-hot-toast';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';
import CheckInbox from '../components/CheckInbox.jsx';
import { PASSWORD_HINT } from '../lib/password.js';
import { Button, ErrorState, Field, Input, Select, Textarea } from '../components/ui/index.js';
import { homeFor } from '../components/ProtectedRoute.jsx';

const ORGANIZATION_MAX = 120;
const NOTE_MAX = 500;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', accountType: 'student', organization: '', note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(''); // set once the server asks the user to verify their email

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const teacher = form.accountType === 'teacher';

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { name, email, password, accountType, organization, note } = form;
      const teacher = accountType === 'teacher';
      const result = await register({ name, email, password, accountType, ...(teacher ? { organization, note } : {}) });
      if (result?.pending) { setPendingEmail(result.email); return; }
      toast.success(teacher ? 'Application submitted.' : 'Account created.');
      navigate(homeFor(result?.role));
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
        <Field label="Account type" hint={teacher ? 'Teacher accounts need approval from an administrator before they can be used.' : undefined}>
          <Select value={form.accountType} onChange={set('accountType')}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </Select>
        </Field>
        {teacher && (
          <>
            <Field label="Organization" hint={`${form.organization.length}/${ORGANIZATION_MAX}`}>
              <Input value={form.organization} onChange={set('organization')} maxLength={ORGANIZATION_MAX} autoComplete="organization" minLength={2} required />
            </Field>
            <Field label="Note for the administrator (optional)" hint={`${form.note.length}/${NOTE_MAX}`}>
              <Textarea value={form.note} onChange={set('note')} maxLength={NOTE_MAX} rows={3} />
            </Field>
          </>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>{teacher ? 'Apply for a teacher account' : 'Create account'}</Button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthCard>
  );
}
