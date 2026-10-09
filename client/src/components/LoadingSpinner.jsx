import { Spinner } from './FormMotion.jsx';

/**
 * Block-level loading indicator for data fetched from the backend. Use
 * `full` for a page-level loading state (more vertical padding, larger
 * spinner); the default is compact, for inline use inside a card/section.
 */
export default function LoadingSpinner({ label = 'Loading…', full = false }) {
  return (
    <div role="status" aria-live="polite"
      className={`flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 ${
        full ? 'py-16' : 'py-6'
      }`}
    >
      <Spinner className={full ? 'h-6 w-6' : 'h-4 w-4'} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
