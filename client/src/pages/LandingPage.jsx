import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const STEPS = [
  {
    title: 'Solve a problem',
    body: 'Pick a problem from the bank, write your solution in the built-in editor, in whichever supported language you like.',
    icon: CodeIcon,
  },
  {
    title: 'Get graded instantly',
    body: 'Your code runs against every test case in a sandboxed judge, and an AI reviewer adds feedback on correctness and complexity.',
    icon: CheckIcon,
  },
  {
    title: 'Ask when you’re stuck',
    body: 'Post a doubt and get an AI-drafted answer right away — a teacher reviews and approves it before you ever see it.',
    icon: ChatIcon,
  },
];

export default function LandingPage() {
  const { isAuthed, loading } = useAuth();

  if (loading) return <LoadingSpinner full />;
  if (isAuthed) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-20 pb-8">
      {/* Hero */}
      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="pt-6 text-center"
      >
        <motion.div
          variants={fadeUp}
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
        >
          <BracketIcon />
        </motion.div>
        <motion.h1 variants={fadeUp} className="text-3xl font-bold tracking-tight sm:text-4xl">
          CodeGrade
        </motion.h1>
        <motion.p
          variants={fadeUp}
          className="mx-auto mt-3 max-w-xl text-base text-slate-500 dark:text-slate-400"
        >
          Solve coding problems, get instant automated grading with AI feedback, and get your
          doubts answered — all in one place, built for classrooms.
        </motion.p>
        <motion.div variants={fadeUp} className="mt-6 flex justify-center gap-3">
          <Link className="btn" to="/register">
            Get started
          </Link>
          <Link className="btn-ghost" to="/login">
            Log in
          </Link>
        </motion.div>
      </motion.section>

      {/* What is CodeGrade */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.35 }}
        className="card mx-auto max-w-2xl"
      >
        <h2 className="mb-2 text-lg font-semibold">What is CodeGrade?</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          CodeGrade is an AI-assisted coding portal for classrooms. Teachers publish coding
          problems, tagged by topic, with sample I/O and hidden test cases; students submit
          solutions in the language of their choice and get graded automatically. When a
          student is stuck, they can ask a doubt — an AI drafts an answer immediately, and a
          teacher reviews it before it's published, so nothing reaches a student unchecked.
        </p>
      </motion.section>

      {/* How it works */}
      <section>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          className="mb-6 text-center text-lg font-semibold"
        >
          How it works
        </motion.h2>
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="grid gap-4 sm:grid-cols-3"
        >
          {STEPS.map((step, i) => (
            <motion.div key={step.title} variants={fadeUp} className="card">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <step.icon />
              </div>
              <h3 className="font-semibold">
                {i + 1}. {step.title}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{step.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 pt-6 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        <p>CodeGrade — an AI-powered code grading & doubt resolution portal.</p>
        <p className="mt-1">&copy; {new Date().getFullYear()} CodeGrade. Built for classrooms.</p>
      </footer>
    </div>
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
      className="h-7 w-7"
    >
      <path d="M9 18 3 12l6-6M15 6l6 6-6 6" />
    </svg>
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
