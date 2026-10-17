import { Button, PageHeader } from '../components/ui/index.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function NotFound() {
  const { isAuthed } = useAuth();
  return (
    <div className="max-w-md">
      <PageHeader title="Page not found" description="The link may have changed, or the page may no longer exist." />
      <Button variant="primary" to={isAuthed ? '/dashboard' : '/'}>{isAuthed ? 'Go to dashboard' : 'Go to home'}</Button>
    </div>
  );
}
