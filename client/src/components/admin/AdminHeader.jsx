import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ClipboardList, Code2, LogOut, Moon, ScrollText, ShieldCheck, Sun, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { cn } from '../../lib/cn.js';
import { Badge, Button, Icon } from '../ui/index.js';
import { usePendingCount } from './usePendingCount.js';

/**
 * The admin's own shell: a top bar with the three admin pages. It shows no student or teacher feature (no
 * notification bell, no XP meter, no feature flags), so it never calls an endpoint the admin may not use.
 */
export default function AdminHeader() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const pending = usePendingCount();
  const link = ({ isActive }) => cn('flex h-9 shrink-0 items-center gap-2 rounded-sm px-3 text-sm font-medium transition-colors', isActive ? 'bg-accent-subtle text-accent-text' : 'text-fg-muted hover:bg-subtle hover:text-fg');
  async function onLogout() {
    try { await logout(); toast.success('Logged out.'); navigate('/admin/login'); }
    catch { toast.error('Unable to log out. Check your connection and try again.'); }
  }
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-3 sm:px-6">
        <Link to="/admin" className="inline-flex shrink-0 items-center gap-2 rounded-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-sm bg-accent text-accent-fg"><Icon as={Code2} /></span>
          <span className="hidden sm:inline">CodeGrade</span>
          <Badge tone="neutral" icon={ShieldCheck}>Admin</Badge>
        </Link>
        <nav aria-label="Admin navigation" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <NavLink to="/admin/applications" className={link}>
            <Icon as={ClipboardList} />Applications
            {pending > 0 && <Badge tone="accent" aria-label={`${pending} waiting`}>{pending}</Badge>}
          </NavLink>
          <NavLink to="/admin/users" className={link}><Icon as={Users} />Users</NavLink>
          <NavLink to="/admin/audit-log" className={link}><Icon as={ScrollText} />Audit log</NavLink>
        </nav>
        <Button variant="ghost" iconOnly onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}><Icon as={theme === 'dark' ? Sun : Moon} /></Button>
        <Button variant="ghost" size="sm" onClick={onLogout}><Icon as={LogOut} />Log out</Button>
      </div>
    </header>
  );
}
