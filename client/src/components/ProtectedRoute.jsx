import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { PageSkeleton } from './ui/index.js';
import NotFound from '../pages/NotFound.jsx';

/** Where each kind of account belongs once signed in. */
export const homeFor = (role) => (role === 'admin' ? '/admin' : role === 'teacher_applicant' ? '/pending-approval' : '/dashboard');

// Gate a route behind authentication and (optionally) a required role. The product pages are for students
// and teachers only: an applicant is sent to the approval page and the admin to /admin.
export default function ProtectedRoute({ children, role }) {
  const { user, isAuthed, loading } = useAuth();

  // Wait for the on-load silent refresh before deciding, so a page reload
  // doesn't flash the login screen while the session is being restored.
  if (loading) {
    return <PageSkeleton />;
  }
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (user.role === 'admin' || user.role === 'teacher_applicant') return <Navigate to={homeFor(user.role)} replace />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}

/**
 * Gate for /admin. Anyone who is not the signed-in admin sees the normal "Page not found" page, the same as
 * for a URL that does not exist, so the admin area does not show itself.
 */
export function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (user?.role !== 'admin') return <NotFound />;
  return children;
}

/** The "awaiting approval" page belongs to teacher applicants only. */
export function ApplicantRoute({ children }) {
  const { user, isAuthed, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (user.role !== 'teacher_applicant') return <Navigate to={homeFor(user.role)} replace />;
  return children;
}
