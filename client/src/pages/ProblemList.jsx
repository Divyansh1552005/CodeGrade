import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { usePaginatedQuery } from '../api/usePaginatedQuery.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import TopicFilter from '../components/TopicFilter.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function ProblemList() {
  const { user } = useAuth();
  const isTeacher = user.role === 'teacher';
  const [selectedTopics, setSelectedTopics] = useState([]);
  const query = selectedTopics.length
    ? `/problems?topics=${selectedTopics.map(encodeURIComponent).join(',')}`
    : '/problems';
  const {
    items: problems,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refetch,
  } = usePaginatedQuery(query, 'problems');
  const { data: stats } = useCachedQuery('/problems/stats/counts');

  const [pendingDelete, setPendingDelete] = useState(null); // problem being confirmed
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    const problem = pendingDelete;
    setDeleting(true);
    try {
      const { data: res } = await api.delete(`/problems/${problem._id}`);
      refetch();
      setPendingDelete(null);
      toast.success(
        res.softDeleted ? 'Problem archived (it has existing submissions).' : 'Problem deleted.'
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-baseline gap-2 text-xl font-semibold">
          Problems
          {typeof stats?.total === 'number' && (
            <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
              {stats.total} total
            </span>
          )}
        </h1>
        {isTeacher && (
          <Link className="btn btn-sm" to="/problems/new">
            + Create Problem
          </Link>
        )}
      </div>

      {!isTeacher && (
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Submissions are limited to 2 per minute and 20 per day.
        </p>
      )}

      <TopicFilter
        selected={selectedTopics}
        onChange={setSelectedTopics}
        counts={stats?.byTopic}
      />

      {loading && <LoadingSpinner />}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!loading && problems.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          {selectedTopics.length
            ? 'No problems match the selected topics.'
            : `No problems yet.${isTeacher ? ' Create one to get started.' : ''}`}
        </p>
      )}

      <div className="space-y-3">
        {problems.map((p) => {
          const mine = isTeacher && String(p.createdBy) === String(user.id || user._id);
          return (
            <div
              key={p._id}
              className={`card flex items-start justify-between gap-4 ${
                p.solved
                  ? 'border-green-300 bg-green-50 dark:border-green-900/60 dark:bg-green-950/30'
                  : ''
              }`}
            >
              <div>
                <h3 className="flex items-center gap-2 font-semibold">
                  {typeof p.number === 'number' && (
                    <span className="text-slate-400 dark:text-slate-500">
                      Problem {p.number}:
                    </span>
                  )}
                  {p.title}
                  <span className="badge capitalize">{p.difficulty || 'easy'}</span>
                  {p.solved && (
                    <span className="badge bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                      Solved
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{p.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {p.testCases?.length || 0} test case(s)
                  </span>
                  {(p.topics || []).map((topic) => (
                    <span key={topic} className="pill">
                      {topic}
                    </span>
                  ))}
                </div>
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
                      className="btn-ghost btn-sm text-red-600 dark:text-red-400"
                      onClick={() => setPendingDelete(p)}
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

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button className="btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => !deleting && setPendingDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
        title="Delete problem?"
        message={
          <>
            This will delete <strong>{pendingDelete?.title}</strong>. If students have already
            submitted solutions, it will be archived instead so their history is preserved.
          </>
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
