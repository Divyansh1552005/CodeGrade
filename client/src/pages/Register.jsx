import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Create account</h1>
      <form onSubmit={onSubmit}>
        <label className="field">
          Name
          <input className="input" value={form.name} onChange={set('name')} required />
        </label>
        <label className="field">
          Email
          <input className="input" value={form.email} onChange={set('email')} type="email" required />
        </label>
        <label className="field">
          Password
          <input
            className="input"
            value={form.password}
            onChange={set('password')}
            type="password"
            minLength={6}
            required
          />
        </label>
        <label className="field">
          Role
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </label>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button className="btn w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Register'}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-500">
        Have an account?{' '}
        <Link className="font-medium text-slate-900" to="/login">
          Log in
        </Link>
      </p>
    </div>
  );
}
