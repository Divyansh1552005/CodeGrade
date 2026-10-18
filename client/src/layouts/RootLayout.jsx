import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, ScrollRestoration } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AppShell from '../components/AppShell.jsx';
import ColdStartNotice from '../components/ColdStartNotice.jsx';
import { PageSkeleton, Toaster } from '../components/ui/index.js';
import { cn } from '../lib/cn.js';

export default function RootLayout() {
  const { user, isAuthed } = useAuth();
  const hasSidebar = isAuthed && (user?.role === 'student' || user?.role === 'teacher');
  const location = useLocation();
  const isWorkspace = location.pathname.startsWith('/submit');
  // Pages that manage their own scrolling (sticky table headers, resizable panes) get a fixed-height shell.
  const fillHeight = isWorkspace || location.pathname === '/problems';
  useEffect(() => {
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className={cn('flex flex-col', fillHeight ? 'h-dvh' : 'min-h-dvh')}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg">Skip to content</a>
      <ColdStartNotice />
      <AppShell />
      <main id="main-content" tabIndex={-1} className={cn('min-h-0 flex-1 outline-none', hasSidebar && 'lg:pl-56')}>
        <div className={cn('mx-auto w-full', isWorkspace ? 'h-full px-3 py-3' : 'max-w-6xl px-4 py-6 sm:px-6 sm:py-8', fillHeight && !isWorkspace && 'h-full')}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <ScrollRestoration />
      <Toaster />
    </div>
  );
}
