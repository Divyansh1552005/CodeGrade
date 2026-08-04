import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';
import { formContainer, formItem, ErrorBanner, Spinner } from '../components/FormMotion.jsx';

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
    <AuthCard title="Create account" subtitle="Join to start solving or teaching">
      <motion.form variants={formContainer} initial="hidden" animate="show" onSubmit={onSubmit}>
        <motion.label variants={formItem} className="field">
          Name
          <input className="input" value={form.name} onChange={set('name')} required />
        </motion.label>
        <motion.label variants={formItem} className="field">
          Email
          <input
            className="input"
            value={form.email}
            onChange={set('email')}
            type="email"
            required
          />
        </motion.label>
        <motion.label variants={formItem} className="field">
          Password
          <input
            className="input"
            value={form.password}
            onChange={set('password')}
            type="password"
            minLength={6}
            required
          />
        </motion.label>
        <motion.label variants={formItem} className="field">
          Role
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </motion.label>

        <ErrorBanner>{error}</ErrorBanner>

        <motion.div variants={formItem}>
          <motion.button
            whileTap={{ scale: 0.98 }}
            className="btn flex w-full items-center justify-center gap-2"
            disabled={busy}
          >
            {busy && <Spinner />}
            {busy ? 'Creating…' : 'Register'}
          </motion.button>
        </motion.div>
      </motion.form>

      <motion.p
        variants={formItem}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.4 }}
        className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        Have an account?{' '}
        <Link className="font-medium text-slate-900 dark:text-slate-100" to="/login">
          Log in
        </Link>
      </motion.p>
    </AuthCard>
  );
}
