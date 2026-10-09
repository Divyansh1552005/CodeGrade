import { AnimatePresence, motion } from 'framer-motion';

// Stagger children (form fields) in on mount.
export const formContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
export const formItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export const MotionForm = motion.form;
export const MotionLabel = motion.label;

/** Error banner that slides/shakes in and out with AnimatePresence. */
export function ErrorBanner({ children }) {
  return (
    <AnimatePresence>
      {children && (
        <motion.p role="alert"
          initial={{ opacity: 0, height: 0, y: -4 }}
          animate={{ opacity: 1, height: 'auto', y: 0, x: [0, -6, 6, -3, 0] }}
          exit={{ opacity: 0, height: 0, y: -4 }}
          transition={{ duration: 0.3 }}
          className="error-state overflow-hidden"
        >
          {children}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** Small spinner for use inside a busy submit button. */
export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
