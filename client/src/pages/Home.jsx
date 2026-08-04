import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const tileClass =
  'block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600';

export default function Home() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      <p className="mt-1 text-slate-500 dark:text-slate-400">
        You are signed in as a <strong>{user.role}</strong>.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link className={tileClass} to="/problems">
          <h3 className="font-semibold">Problems</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {user.role === 'student'
              ? 'Browse problems and solve them — run against test cases and get AI feedback.'
              : 'Create and manage coding problems for students.'}
          </p>
        </Link>
        <Link className={tileClass} to="/doubts">
          <h3 className="font-semibold">Doubt Board</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ask questions; an AI draft is prepared for teacher review.
          </p>
        </Link>
        {user.role === 'teacher' && (
          <Link className={tileClass} to="/review">
            <h3 className="font-semibold">Review Queue</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Approve, edit, or reject AI-drafted answers.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
