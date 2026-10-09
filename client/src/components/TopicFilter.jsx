import { AnimatePresence, motion } from 'framer-motion';
import { TOPICS } from '../data/topics.js';

/**
 * Multi-select chip filter over the topic list, scoped to a "Filter by
 * topic" panel with a visible active-count and a clear-all action. Only
 * topics that actually have at least one matching problem are shown (via
 * `counts`), so the bar doesn't drown a small problem bank in 20+ dead
 * chips. An "All" chip is always first, doubling as the clear action.
 */
export default function TopicFilter({ selected, onChange, counts }) {
  function toggle(topic) {
    onChange(
      selected.includes(topic) ? selected.filter((t) => t !== topic) : [...selected, topic]
    );
  }

  // Wait for counts before rendering — otherwise the bar would flash all 21
  // topics and then immediately shrink down to the ones that actually match.
  if (!counts) return null;
  const available = TOPICS.filter((t) => counts[t] > 0);
  if (available.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card mb-6 !p-5"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <FilterIcon />
          Filter by topic
          {selected.length > 0 && (
            <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              {selected.length}
            </span>
          )}
        </div>
        <AnimatePresence>
          {selected.length > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              onClick={() => onChange([])}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
            >
              <ClearIcon />
              Clear all
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip active={selected.length === 0} onClick={() => onChange([])} label="All" />
        {available.map((topic) => (
          <Chip
            key={topic}
            active={selected.includes(topic)}
            onClick={() => toggle(topic)}
            label={topic}
            count={counts?.[topic]}
          />
        ))}
      </div>
    </motion.div>
  );
}

function Chip({ active, onClick, label, count }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
        active
          ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
          : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-100'
      }`}
    >
      {active && <CheckIcon />}
      {label}
      {typeof count === 'number' && (
        <span className={active ? 'opacity-80' : 'text-slate-400 dark:text-slate-500'}>
          {count}
        </span>
      )}
    </motion.button>
  );
}

function FilterIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="M18 6 6 18M6 6l12 12" />
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
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
