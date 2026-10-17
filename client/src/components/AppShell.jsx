import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import toast from 'react-hot-toast';
import { ChevronsUpDown, ClipboardCheck, Code2, LayoutDashboard, LogOut, Menu, MessagesSquare, Moon, Sun, Trophy, Upload, User, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { cn } from '../lib/cn.js';
import {
  Avatar, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Icon, Progress,
} from './ui/index.js';

function navLinks(role) {
  return [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/problems', label: 'Problems', icon: Code2 },
    { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { to: '/doubts', label: 'Doubts', icon: MessagesSquare },
    ...(role === 'teacher'
      ? [{ to: '/review', label: 'Review queue', icon: ClipboardCheck }, { to: '/bulk-jobs', label: 'Imports and reports', icon: Upload }]
      : []),
  ];
}

function Brand({ isAuthed }) {
  return (
    <Link to={isAuthed ? '/dashboard' : '/'} className="inline-flex items-center gap-2 rounded-sm font-semibold">
      <span className="flex size-7 items-center justify-center rounded-sm bg-accent text-accent-fg"><Icon as={Code2} /></span>
      CodeGrade
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <Button variant="ghost" iconOnly onClick={toggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      <Icon as={dark ? Sun : Moon} />
    </Button>
  );
}

function NavItems({ role }) {
  return navLinks(role).map(({ to, label, icon }) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) => cn(
        'flex h-9 items-center gap-2 rounded-sm px-3 text-sm font-medium transition-colors',
        isActive ? 'bg-accent-subtle text-accent-text' : 'text-fg-muted hover:bg-subtle hover:text-fg'
      )}
    >
      <Icon as={icon} />{label}
    </NavLink>
  ));
}

/** Level and XP toward the next level. Shares the Dashboard's cached progress query. */
function XpMeter({ userId }) {
  const { data } = useCachedQuery('/activity/progress', { key: `progress:${userId}`, refetchInterval: 10000 });
  const stats = data?.progress;
  if (!stats) return null;
  const percent = stats.xpForNextLevel ? (100 * stats.xpIntoLevel) / stats.xpForNextLevel : 0;
  return (
    <div className="px-3">
      <div className="mb-1.5 flex items-baseline justify-between text-xs text-fg-muted">
        <span>Level {stats.level}</span>
        <span className="tabular-nums">{stats.xp} XP</span>
      </div>
      <Progress value={percent} label="XP toward next level" />
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); toast.success('Logged out.'); navigate('/login'); }
    catch { toast.error('Unable to log out. Check your connection and try again.'); }
    finally { setLoggingOut(false); }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Account menu" className="flex h-11 w-full min-w-0 items-center gap-2 rounded-sm px-2 text-left transition-colors hover:bg-subtle">
          <Avatar name={user?.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user?.name}</span>
            <span className="block text-xs capitalize text-fg-muted">{user?.role}</span>
          </span>
          <Icon as={ChevronsUpDown} className="text-fg-subtle" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuItem asChild><Link to="/profile"><Icon as={User} />Profile</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={loggingOut} onSelect={handleLogout}><Icon as={LogOut} />Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({ user }) {
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="px-2 pt-1"><Brand isAuthed /></div>
      <nav aria-label="Main navigation" className="flex flex-col gap-0.5"><NavItems role={user?.role} /></nav>
      <div className="mt-auto flex flex-col gap-3">
        {user?.role === 'student' && <XpMeter userId={user._id} />}
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1"><UserMenu /></div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

/** Persistent sidebar from `lg` up, a top bar with a drawer below it. Unauthenticated visitors get a minimal top bar. */
export default function AppShell() {
  const { user, isAuthed } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);

  if (!isAuthed) {
    return (
      <header className="flex h-12 items-center justify-between px-4 sm:px-6">
        <Brand isAuthed={false} />
        <div className="flex items-center gap-1">
          {location.pathname === '/' && (
            <>
              <Button variant="ghost" size="sm" to="/login">Log in</Button>
              <Button variant="primary" size="sm" to="/register">Sign up</Button>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>
    );
  }
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-border bg-surface lg:block">
        <SidebarContent user={user} />
      </aside>
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-surface px-3 lg:hidden">
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <Button variant="ghost" iconOnly aria-label="Open navigation"><Icon as={Menu} /></Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
            <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 w-64 max-w-full border-r border-border bg-surface shadow-overlay">
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm" iconOnly aria-label="Close navigation" className="absolute right-2 top-2"><Icon as={X} /></Button>
              </Dialog.Close>
              <SidebarContent user={user} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Brand isAuthed />
        <ThemeToggle />
      </header>
    </>
  );
}
