import { PageHeader, EmptyState, ErrorState, Icon } from '../components/UI.jsx';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { usePaginatedQuery } from '../api/usePaginatedQuery.js';
import { useAuth } from '../auth/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

// Plain-text excerpt of a markdown body, truncated for the list view.
function excerpt(body, max = 100) {
  const text = String(body || '')
    .replace(/[#>*_`~\-]/g, ' ') // strip common markdown punctuation
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function statusFor(doubt) {
  if (doubt.hasApprovedAnswer)
    return {
      label: 'approved',
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    };
  if (doubt.aiDraftStatus === 'irrelevant')
    return {
      label: 'flagged as off-topic',
      cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
    };
  if (doubt.aiDraftStatus === 'failed')
    return {
      label: 'awaiting teacher response',
      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    };
  return { label: 'awaiting review', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
}

export default function DoubtBoard() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const {
    items: doubts,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  } = usePaginatedQuery('/doubts', 'doubts');

  return (
    <div>
      <PageHeader eyebrow="Learn together" title="Doubt board" description="Good questions move learning forward. Explore questions and teacher-reviewed answers." action={isStudent && <Link className="btn" to="/doubts/new"><Icon name="chat" className="h-4 w-4" />Ask a doubt</Link>} />
      {loading && <LoadingSpinner />}
      {error && <ErrorState message={error} />}
      {!loading && !error && doubts.length === 0 && <EmptyState icon="chat" title="Start a conversation" description="Share the programming question you're working through. A teacher will help you find the next step." action={isStudent && <Link className="btn" to="/doubts/new">Ask your first doubt</Link>} />}

      <div className="space-y-3">
        {doubts.map((d) => (
          <DoubtRow key={d._id} doubt={d} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button className="btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

const DoubtRow = memo(function DoubtRow({ doubt }) {
  const status = statusFor(doubt);
  return (
    <Link
      to={`/doubts/${doubt._id}`}
      className="list-row block !p-5"
    >
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <h3 className="break-words font-semibold text-slate-800 dark:text-slate-100">{doubt.title}</h3>
        <span className={`badge shrink-0 ${status.cls}`}>{status.label}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{excerpt(doubt.body)}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          by {doubt.studentId?.name || 'student'}
        </span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">View →</span>
      </div>
    </Link>
  );
});
