import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';
import { useAuth } from '../auth/AuthContext.jsx';

// Languages that have non-empty starter code for a problem.
const startersFor = (p) =>
  Object.entries(p.starterCode || {})
    .filter(([, code]) => code && code.trim())
    .map(([lang]) => lang);

export default function ProblemList() {
  const { user } = useAuth();
  const isTeacher = user.role === 'teacher';
  const { data, loading, error, refetch } = useCachedQuery('/problems');
  const problems = data?.problems ?? [];

  async function onDelete(id) {
    if (!window.confirm('Delete this problem?')) return;
    try {
      await api.delete(`/problems/${id}`);
      invalidate('/problems');
      refetch();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Problems</h1>
        {isTeacher && (
          <Link className="btn btn-sm" to="/problems/new">
            + Create Problem
          </Link>
        )}
      </div>

      {loading && <p className="text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && problems.length === 0 && (
        <p className="text-sm text-slate-400">
          No problems yet.{isTeacher && ' Create one to get started.'}
        </p>
      )}

      <div className="space-y-3">
        {problems.map((p) => {
          const mine = isTeacher && String(p.createdBy) === String(user.id || user._id);
          return (
            <div
              key={p._id}
              className={`card flex items-start justify-between gap-4 ${
                p.solved ? 'border-green-300 bg-green-50' : ''
              }`}
            >
              <div>
                <h3 className="flex items-center gap-2 font-semibold">
                  {p.title}
                  {p.solved && (
                    <span className="badge bg-green-100 text-green-700">Solved</span>
                  )}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{p.description}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-400">
                  <span>{p.testCases?.length || 0} test case(s)</span>
                  {startersFor(p).length > 0 && (
                    <>
                      <span>·</span>
                      <span>starters:</span>
                      {startersFor(p).map((lang) => (
                        <span key={lang} className="pill">{lang}</span>
                      ))}
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {user.role === 'student' && (
                  <Link className="btn btn-sm" to={`/submit/${p._id}`}>
                    Solve
                  </Link>
                )}
                {mine && (
                  <>
                    <Link className="btn-ghost btn-sm" to={`/problems/${p._id}/edit`}>
                      Edit
                    </Link>
                    <button
                      className="btn-ghost btn-sm text-red-600"
                      onClick={() => onDelete(p._id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
