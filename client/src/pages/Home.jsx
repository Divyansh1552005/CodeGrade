import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext.jsx';

const tileClass =
  'block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function Home() {
  const { user } = useAuth();
  return (
    <div>
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-semibold"
      >
        Welcome, {user.name}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mt-1 text-slate-500 dark:text-slate-400"
      >
        You are signed in as a <strong>{user.role}</strong>.
      </motion.p>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mt-6 grid gap-4 sm:grid-cols-2"
      >
        <motion.div variants={item} whileHover={{ y: -2 }}>
          <Link className={tileClass} to="/problems">
            <h3 className="font-semibold">Problems</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {user.role === 'student'
                ? 'Browse problems and solve them — run against test cases and get AI feedback.'
                : 'Create and manage coding problems for students.'}
            </p>
          </Link>
        </motion.div>
        <motion.div variants={item} whileHover={{ y: -2 }}>
          <Link className={tileClass} to="/doubts">
            <h3 className="font-semibold">Doubt Board</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Ask questions; an AI draft is prepared for teacher review.
            </p>
          </Link>
        </motion.div>
        {user.role === 'teacher' && (
          <motion.div variants={item} whileHover={{ y: -2 }}>
            <Link className={tileClass} to="/review">
              <h3 className="font-semibold">Review Queue</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Approve, edit, or reject AI-drafted answers.
              </p>
            </Link>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
