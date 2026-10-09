import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext.jsx';
import ActivityPanel from '../components/ActivityPanel.jsx';
import { useCachedQuery } from '../api/useCachedQuery.js';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const isTeacher = user.role === 'teacher';

  const { data: stats } = useCachedQuery('/problems/stats/counts');
  const { data: subData, loading: subLoading } = useCachedQuery('/submissions', {
    enabled: isStudent,
  });
  const { data: pendingData, loading: pendingLoading } = useCachedQuery(
    '/answers?state=pending',
    { key: 'answers:pending', enabled: isTeacher }
  );

  const submissions = subData?.submissions ?? [];
  const solvedCount = new Set(
    submissions
      .filter((s) => s.status === 'graded' && s.totalCount > 0 && s.passCount === s.totalCount)
      .map((s) => String(s.problemId?._id || s.problemId))
  ).size;
  const pendingCount = pendingData?.answers?.length ?? 0;

  const tiles = [
    {
      to: '/problems',
      title: 'Problems',
      body: isStudent
        ? 'Browse problems and solve them — run against test cases and get AI feedback.'
        : 'Create and manage coding problems for students.',
      icon: CodeIcon,
    },
    {
      to: '/doubts',
      title: 'Doubt Board',
      body: 'Ask questions; an AI draft is prepared for teacher review.',
      icon: ChatIcon,
    },
    isTeacher && { to: '/bulk-jobs', title: 'Imports & Reports', body: 'Import problems and generate reports in the background.', icon: CodeIcon },
    isTeacher && {
      to: '/review',
      title: 'Review Queue',
      body: 'Approve, edit, or reject AI-drafted answers.',
      icon: CheckIcon,
    },
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card flex flex-wrap items-center gap-4"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          {user.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">
            {greeting()}, {user.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            You are signed in as a <strong className="font-medium">{user.role}</strong>.
          </p>
        </div>
      </motion.div>

      {/* Quick stats */}
      {(isStudent || isTeacher) && (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2"
        >
          {isStudent && (
            <motion.div variants={item} className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Problems solved
              </p>
              <p className="mt-1 text-3xl font-semibold">
                {subLoading ? '—' : solvedCount}
                <span className="text-slate-400 dark:text-slate-500">
                  /{stats?.total ?? '—'}
                </span>
              </p>
            </motion.div>
          )}
          {isTeacher && (
            <motion.div variants={item} className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Awaiting your review
              </p>
              <p className="mt-1 text-3xl font-semibold">
                {pendingLoading ? '—' : pendingCount}
              </p>
            </motion.div>
          )}
          <motion.div variants={item} className="card">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Problems in the bank
            </p>
            <p className="mt-1 text-3xl font-semibold">{stats?.total ?? '—'}</p>
          </motion.div>
        </motion.div>
      )}

      <ActivityPanel isStudent={isStudent} userId={user._id} />

      {/* Actions */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className={`grid gap-4 ${isTeacher ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
      >
        {tiles.map((tile) => (
          <motion.div key={tile.to} variants={item} whileHover={{ y: -2 }} className="h-full">
            <Link
              to={tile.to}
              className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <tile.icon />
              </div>
              <h3 className="font-semibold">{tile.title}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tile.body}</p>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function CodeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M8 17 3 12l5-5M16 7l5 5-5 5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
