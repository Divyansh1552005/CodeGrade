import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import NavBar from '../components/NavBar.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';

function Fallback() {
  return <div className="p-10 text-center text-slate-400 dark:text-slate-500">Loading…</div>;
}

export default function RootLayout() {
  const { theme } = useTheme();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Suspense fallback={<Fallback />}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: theme === 'dark'
            ? { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' }
            : { background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' },
        }}
      />
    </div>
  );
}
