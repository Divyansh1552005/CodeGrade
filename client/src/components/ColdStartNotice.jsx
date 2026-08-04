import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

const STORAGE_KEY = 'coldstart-notice-dismissed';
const RENDER_URL = 'https://codegrade.onrender.com';

/**
 * One-per-session heads-up that the backend is on Render's free tier and may
 * need a manual cold-start visit. Gated on sessionStorage (not localStorage)
 * so it reappears in a fresh tab/session but not on every page navigation
 * within the same visit.
 */
export default function ColdStartNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    setOpen(true);
  }, []);

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && dismiss();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && dismiss()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Server cold-start notice"
            className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 pt-11 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-500"
            >
              <CrossIcon />
            </button>

            <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Waking up the server
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              This site's backend runs on Render's free tier, which spins down after
              a period of inactivity. If things feel slow or a login fails on the
              first try, open the link below in a new tab to cold-start it
              (~30–60s), then come back here and try again.
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              When it wakes up, the tab will show something like{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">
                {'{"error":"Not found"}'}
              </code>{' '}
              — that's expected, not a failure. The backend is an API only, with no
              page at its root URL, so a plain browser visit just hits its 404
              handler. Seeing that JSON (instead of a timeout or a connection error)
              is actually the confirmation you want: the server is awake and
              responding correctly.
            </p>
            <a
              href={RENDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn mt-4 flex w-full items-center justify-center"
            >
              Cold-start the backend →
            </a>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function CrossIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
