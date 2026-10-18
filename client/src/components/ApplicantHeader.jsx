import { useNavigate } from 'react-router-dom';
import { Code2, LogOut, Moon, Sun } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { Button, Icon } from './ui/index.js';

/** The only chrome a teacher applicant gets: the brand, the theme and Log out. No navigation, no data calls. */
export default function ApplicantHeader() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  async function onLogout() {
    try { await logout(); toast.success('Logged out.'); navigate('/login'); }
    catch { toast.error('Unable to log out. Check your connection and try again.'); }
  }
  return (
    <header className="flex h-12 items-center justify-between px-4 sm:px-6">
      <span className="inline-flex items-center gap-2 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-sm bg-accent text-accent-fg"><Icon as={Code2} /></span>CodeGrade
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" iconOnly onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}><Icon as={theme === 'dark' ? Sun : Moon} /></Button>
        <Button variant="ghost" size="sm" onClick={onLogout}><Icon as={LogOut} />Log out</Button>
      </div>
    </header>
  );
}
