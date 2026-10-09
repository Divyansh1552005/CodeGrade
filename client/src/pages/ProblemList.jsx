import { PageHeader, EmptyState, ErrorState, Icon } from '../components/UI.jsx';
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
      <PageHeader eyebrow="Practice & progress" title="Problem library" description={isTeacher ? 'Create thoughtful challenges and help your students build confidence.' : 'Choose your next challenge. Practice at your pace, then learn from your results.'} action={isTeacher && <Link className="btn" to="/problems/new"><Icon name="code" className="h-4 w-4" />Create problem</Link>} />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400"><span className="pill">{stats?.total ?? '—'} problems</span>{!isTeacher && <span>2 submissions per minute · 20 per day</span>}</div>
      <TopicFilter
        selected={selectedTopics}
        onChange={setSelectedTopics}
        counts={stats?.byTopic}
      />

      {loading && <LoadingSpinner />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && !error && problems.length === 0 && <EmptyState icon="code" title={selectedTopics.length ? 'No matches yet' : 'A fresh start'} description={selectedTopics.length ? 'Try another topic or clear your filters to explore the library.' : isTeacher ? 'Create your first problem to start building the library.' : 'Your teachers are preparing new problems. Check back soon.'} action={selectedTopics.length ? <button className="btn-secondary" onClick={() => setSelectedTopics([])}>Clear filters</button> : isTeacher && <Link className="btn" to="/problems/new">Create a problem</Link>} />}

      <div className="space-y-3">
        {problems.map((p) => {
          const mine = isTeacher && String(p.createdBy) === String(user.id || user._id);
          return (
            <div
              key={p._id}
              className={`card flex flex-col justify-between gap-4 sm:flex-row sm:items-center ${
                p.solved
                  ? 'border-green-300 bg-green-50 dark:border-green-900/60 dark:bg-green-950/30'
                  : ''
              }`}
            >
              <div>
                <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
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
