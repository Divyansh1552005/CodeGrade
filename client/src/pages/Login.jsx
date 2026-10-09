import toast from 'react-hot-toast';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';
import { formContainer, formItem, ErrorBanner, Spinner } from '../components/FormMotion.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      toast.success('Welcome back.');
      navigate('/dashboard');
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Log in to continue">
      <motion.form variants={formContainer} initial="hidden" animate="show" onSubmit={onSubmit}>
        <motion.label variants={formItem} className="field">
          Email
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </motion.label>
        <motion.label variants={formItem} className="field">
          Password
          <input
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </motion.label>

        <ErrorBanner>{error}</ErrorBanner>

        <motion.div variants={formItem}>
          <motion.button
            whileTap={{ scale: 0.98 }}
            className="btn flex w-full items-center justify-center gap-2"
            disabled={busy}
          >
            {busy && <Spinner />}
            {busy ? 'Logging in…' : 'Log in'}
          </motion.button>
        </motion.div>
      </motion.form>

      <motion.p
        variants={formItem}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.35 }}
        className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        No account?{' '}
        <Link className="font-medium text-slate-900 dark:text-slate-100" to="/register">
          Register
        </Link>
      </motion.p>
    </AuthCard>
  );
}
