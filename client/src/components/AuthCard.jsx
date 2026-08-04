import { motion } from 'framer-motion';

/**
 * Shared animated shell for the Login/Register cards: a glow accent, a
 * spring-in logo mark, and a fade/slide-up entrance for the card itself.
 */
export default function AuthCard({ title, subtitle, children }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="card relative w-full max-w-sm overflow-hidden"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 18 }}
          className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
        >
          <LogoMark />
        </motion.div>

        <h1 className="relative text-center text-xl font-semibold">{title}</h1>
        {subtitle && (
          <p className="relative mt-1 mb-5 text-center text-sm text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}

        <div className="relative">{children}</div>
      </motion.div>
    </div>
  );
}

function LogoMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M9 18 3 12l6-6M15 6l6 6-6 6" />
    </svg>
  );
}
