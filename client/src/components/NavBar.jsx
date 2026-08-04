import { memo, useCallback, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { Spinner } from './FormMotion.jsx';

const navLinkClass = ({ isActive }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    isActive
      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
  }`;

function NavBar() {
  const { user, isAuthed, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout();
      toast.success('Logged out.');
      navigate('/login');
    } finally {
      setLoggingOut(false);
    }
  }, [logout, navigate]);

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75 dark:border-slate-800 dark:bg-slate-950/90 dark:supports-[backdrop-filter]:bg-slate-950/75">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            to={isAuthed ? '/dashboard' : '/'}
            className="mr-2 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900 dark:text-white"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
              <BracketIcon />
            </span>
            CodeGrade
          </Link>
          {isAuthed && (
            <>
              <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-800" />
              <NavLink className={navLinkClass} to="/problems">
                Problems
              </NavLink>
              <NavLink className={navLinkClass} to="/doubts">
                Doubts
              </NavLink>
              {user.role === 'teacher' && (
                <NavLink className={navLinkClass} to="/review">
                  Review
                </NavLink>
              )}
              <NavLink className={(state) => `${navLinkClass(state)} sm:hidden`} to="/profile">
                Profile
              </NavLink>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          {isAuthed ? (
            <>
              <Link
                to="/profile"
                className="hidden items-center gap-2 rounded-full py-0.5 pl-0.5 pr-3 transition hover:bg-slate-100 sm:flex dark:hover:bg-slate-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                  {user.name?.[0]?.toUpperCase() || '?'}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {user.name} <span className="text-slate-400 dark:text-slate-500">· {user.role}</span>
                </span>
              </Link>
              <motion.button
                whileTap={{ scale: 0.95 }}
                className="btn-ghost btn-sm flex items-center gap-1.5"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut && <Spinner className="h-3.5 w-3.5" />}
                {loggingOut ? 'Logging out…' : 'Logout'}
              </motion.button>
            </>
          ) : (
            <>
              <Link
                className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                to="/login"
              >
                Login
              </Link>
              <Link className="btn btn-sm" to="/register">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function BracketIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M9 18 3 12l6-6M15 6l6 6-6 6" />
    </svg>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileTap={{ scale: 0.85, rotate: -20 }}
      whileHover={{ scale: 1.08 }}
      className="btn-ghost btn-sm relative !p-1.5 overflow-hidden"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? 'sun' : 'moon'}
          initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="flex"
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

export default memo(NavBar);
