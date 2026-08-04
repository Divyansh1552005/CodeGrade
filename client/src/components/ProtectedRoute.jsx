import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Gate a route behind authentication and (optionally) a required role.
export default function ProtectedRoute({ children, role }) {
  const { user, isAuthed, loading } = useAuth();

  // Wait for the on-load silent refresh before deciding, so a page reload
  // doesn't flash the login screen while the session is being restored.
  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading…</div>;
  }
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}
