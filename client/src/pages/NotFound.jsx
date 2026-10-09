import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Icon, PageHeader } from '../components/UI.jsx';

export default function NotFound() {
  const { isAuthed } = useAuth();
  return <div className="card mx-auto my-8 max-w-2xl !p-8 sm:!p-12">
    <span className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon name="search" className="h-6 w-6" /></span>
    <PageHeader eyebrow="404 · Page not found" title="That page isn’t here" description="The link may have changed, or the page may no longer be available. Let’s get you back to your workspace." />
    <Link className="btn" to={isAuthed ? '/dashboard' : '/'}>{isAuthed ? 'Back to overview' : 'Back to home'}<Icon name="arrow" className="h-4 w-4" /></Link>
  </div>;
}
