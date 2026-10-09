import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, ScrollRestoration } from 'react-router-dom';
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { useAuth } from '../auth/AuthContext.jsx';
import NavBar from '../components/NavBar.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ColdStartNotice from '../components/ColdStartNotice.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';

function Fallback() {
  return <LoadingSpinner full />;
}

export default function RootLayout() {
  const { theme } = useTheme();
  const { isAuthed } = useAuth();
  const location = useLocation();
  useEffect(() => {
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <MotionConfig reducedMotion="user"><div className="min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-indigo-600 focus:px-4 focus:py-3 focus:text-white">Skip to content</a>
      <ColdStartNotice />
      <NavBar />
      <main id="main-content" tabIndex={-1} className={`${isAuthed ? 'lg:ml-64' : ''} outline-none`}>
        <div className={`mx-auto ${location.pathname.startsWith('/submit') ? 'max-w-[1600px] px-3 py-5 sm:px-5' : 'max-w-7xl px-4 py-7 sm:px-8 sm:py-10'}`}>
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
        </div>
      </main>
      <ScrollRestoration />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: theme === 'dark'
            ? { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' }
            : { background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' },
        }}
      >
        {(notification) => <ToastBar toast={notification}>{({ icon, message }) => <>{icon}<div className="min-w-0 flex-1">{message}</div>{notification.type !== 'loading' && <button type="button" aria-label="Dismiss notification" className="ml-2 rounded p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => toast.dismiss(notification.id)}>×</button>}</>}</ToastBar>}
      </Toaster>
    </div></MotionConfig>
  );
}
