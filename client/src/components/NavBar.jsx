import { memo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

function NavBar() {
  const { user, isAuthed, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4 text-sm">
          <Link to="/" className="text-base font-bold tracking-tight">
            CodeGrade
          </Link>
          {isAuthed && (
            <>
              <Link className="text-slate-600 hover:text-slate-900" to="/problems">
                Problems
              </Link>
              <Link className="text-slate-600 hover:text-slate-900" to="/doubts">
                Doubts
              </Link>
              {user.role === 'teacher' && (
                <Link className="text-slate-600 hover:text-slate-900" to="/review">
                  Review
                </Link>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {isAuthed ? (
            <>
              <span className="pill">
                {user.name} · {user.role}
              </span>
              <button className="btn-ghost" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link className="text-slate-600 hover:text-slate-900" to="/login">
                Login
              </Link>
              <Link className="btn btn-sm" to="/register">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default memo(NavBar);
