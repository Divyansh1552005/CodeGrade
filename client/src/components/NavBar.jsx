import { memo, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { Icon } from './UI.jsx';
import { Spinner } from './FormMotion.jsx';

const navClass = ({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`;
function Brand({ isAuthed, compact = false }) {
  return <Link to={isAuthed ? '/dashboard' : '/'} className="flex items-center gap-3 font-bold tracking-tight">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><Icon name="code" /></span>
    <span className={`text-base sm:text-lg ${compact ? 'hidden min-[420px]:inline' : ''}`}>CodeGrade<span className="ml-1 text-indigo-500">.</span></span>
  </Link>;
}
function NavBar() {
  const { user, isAuthed, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);
  const links = [
    { to: '/dashboard', label: 'Overview', icon: 'grid' },
    { to: '/problems', label: 'Problem library', icon: 'code' },
    { to: '/doubts', label: 'Doubt board', icon: 'chat' },
    ...(user?.role === 'teacher' ? [{ to: '/review', label: 'Review queue', icon: 'check' }, { to: '/bulk-jobs', label: 'Imports & reports', icon: 'upload' }] : []),
    { to: '/profile', label: 'My profile', icon: 'user' },
  ];
  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); toast.success('Logged out.'); navigate('/login'); }
    catch { toast.error('Unable to log out. Please try again.'); }
    finally { setLoggingOut(false); }
  }
  const navigation = <>{links.map(({ to, label, icon }) => <NavLink key={to} to={to} className={navClass}><Icon name={icon} /><span>{label}</span></NavLink>)}</>;
  return <>
    {isAuthed && <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white px-5 py-7 lg:flex dark:border-slate-800 dark:bg-[#111827]">
      <Brand isAuthed />
      <div className="mt-10 mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{user?.role === 'teacher' ? 'Teaching workspace' : 'Learning workspace'}</div>
      <nav aria-label="Main navigation" className="space-y-1">{navigation}</nav>
      <div className="mt-auto rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
        <p className="text-sm font-semibold">{user?.role === 'teacher' ? 'Guide the next breakthrough.' : 'A little progress, every day.'}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{user?.role === 'teacher' ? 'Review answers and help students build confidence.' : 'Practice a problem. Learn from your feedback. Keep going.'}</p>
      </div>
      <Link to="/profile" className="mt-5 flex min-w-0 items-center gap-3 rounded-xl p-2 hover:bg-slate-50 dark:hover:bg-slate-800">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 font-semibold dark:bg-slate-800">{user?.name?.[0]?.toUpperCase() || '?'}</span>
        <span className="min-w-0"><span className="block truncate text-sm font-semibold">{user?.name}</span><span className="text-xs capitalize text-slate-500 dark:text-slate-400">{user?.role}</span></span>
      </Link>
    </aside>}
    <header className={`sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-[#111827]/95 ${isAuthed ? 'lg:ml-64' : ''}`}>
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {isAuthed && <button type="button" className="btn-ghost lg:hidden" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'} /></button>}
          <div className={isAuthed ? 'lg:hidden' : ''}><Brand isAuthed={isAuthed} compact={isAuthed} /></div>
          {isAuthed && <p className="hidden text-sm font-medium text-slate-500 lg:block dark:text-slate-400">Your {user?.role === 'teacher' ? 'teaching' : 'learning'} workspace</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <button type="button" className="btn-ghost" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          {isAuthed ? <button className="btn-ghost" disabled={loggingOut} onClick={handleLogout}>{loggingOut && <Spinner />}{loggingOut ? 'Logging out…' : 'Logout'}</button> : <><Link className="btn-ghost hidden sm:inline-flex" to="/login">Log in</Link><Link className="btn btn-sm" to="/register"><span className="sm:hidden">Sign up</span><span className="hidden sm:inline">Get started</span> <Icon name="arrow" className="hidden h-4 w-4 sm:block" /></Link></>}
        </div>
      </div>
      {isAuthed && open && <nav id="mobile-navigation" aria-label="Mobile navigation" className="space-y-1 border-t border-slate-100 px-4 py-3 lg:hidden dark:border-slate-800">{navigation}</nav>}
    </header>
  </>;
}
export default memo(NavBar);
