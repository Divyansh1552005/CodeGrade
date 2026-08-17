import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useCachedQuery } from '../api/useCachedQuery.js';
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
  const { data, loading, error } = useCachedQuery('/doubts');
  const doubts = data?.doubts ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Doubt Board</h1>
        {isStudent && (
          <Link className="btn btn-sm" to="/doubts/new">
            + Ask a Doubt
          </Link>
        )}
      </div>

      {loading && <LoadingSpinner />}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!loading && doubts.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500">No doubts yet.</p>
      )}

      <div className="space-y-3">
        {doubts.map((d) => (
          <DoubtRow key={d._id} doubt={d} />
        ))}
      </div>
    </div>
  );
}

const DoubtRow = memo(function DoubtRow({ doubt }) {
  const status = statusFor(doubt);
  return (
    <Link
      to={`/doubts/${doubt._id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{doubt.title}</h3>
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
