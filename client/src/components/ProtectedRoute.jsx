import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

// Gate a route behind authentication and (optionally) a required role.
export default function ProtectedRoute({ children, role }) {
  const { user, isAuthed, loading } = useAuth();

  // Wait for the on-load silent refresh before deciding, so a page reload
  // doesn't flash the login screen while the session is being restored.
  if (loading) {
    return <LoadingSpinner full />;
  }
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}
