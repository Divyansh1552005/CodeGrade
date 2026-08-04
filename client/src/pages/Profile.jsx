import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { LANGUAGE_LABELS } from '../data/starterTemplates.js';
import { TOPICS } from '../data/topics.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

const statusFor = (doubt) => {
  if (doubt.hasApprovedAnswer)
    return {
      label: 'answered',
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    };
  if (doubt.aiDraftStatus === 'failed')
    return {
      label: 'awaiting teacher',
      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    };
  return {
    label: 'awaiting review',
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };
};

export default function Profile() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';

  const { data: stats } = useCachedQuery('/problems/stats/counts');
  const { data: subData, loading: subLoading } = useCachedQuery('/submissions', {
    enabled: isStudent,
  });
  const { data: doubtData, loading: doubtLoading } = useCachedQuery('/doubts?mine=1', {
    enabled: isStudent,
  });

  const submissions = subData?.submissions ?? [];
  const doubts = doubtData?.doubts ?? [];
  const activeTopics = TOPICS.filter((t) => stats?.byTopic?.[t] > 0);

  // A problem counts as solved if any submission for it passed every test case.
  const solvedCount = new Set(
    submissions
      .filter((s) => s.totalCount > 0 && s.passCount === s.totalCount)
      .map((s) => String(s.problemId?._id || s.problemId))
  ).size;

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="mb-4 text-xl font-semibold">Profile</h1>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            {user.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
            <span className="pill mt-1 inline-flex capitalize">{user.role}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Problem bank
        </h2>
        <div className="mb-3 flex flex-wrap items-end gap-6">
          {isStudent && (
            <p className="text-3xl font-semibold">
              {subLoading ? '—' : solvedCount}
              <span className="text-slate-400 dark:text-slate-500">
                /{stats?.total ?? '—'}
              </span>
              <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">
                solved
              </span>
            </p>
          )}
          <p className={isStudent ? 'text-lg font-medium text-slate-500 dark:text-slate-400' : 'text-3xl font-semibold'}>
            {stats?.total ?? '—'}
            <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">
              total problems
            </span>
          </p>
        </div>
        {activeTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeTopics.map((topic) => (
              <span key={topic} className="pill">
                {topic} <span className="text-slate-400 dark:text-slate-500">{stats.byTopic[topic]}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {isStudent && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            My Submissions
          </h2>
          {subLoading && <LoadingSpinner />}
          {!subLoading && submissions.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No submissions yet.{' '}
              <Link to="/problems" className="underline">
                Solve a problem
              </Link>
              .
            </p>
          )}
          <div className="space-y-2">
            {submissions.map((s) => {
              const solved = s.totalCount > 0 && s.passCount === s.totalCount;
              return (
                <Link
                  key={s._id}
                  to={`/submit/${s.problemId?._id || s.problemId}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`badge ${
                        solved
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                      }`}
                    >
                      {s.passCount}/{s.totalCount}
                    </span>
                    <span className="font-medium">{s.problemId?.title || 'Problem'}</span>
                    <span className="pill">{LANGUAGE_LABELS[s.language] || s.language}</span>
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {new Date(s.createdAt).toLocaleString()}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {isStudent && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            My Doubts
          </h2>
          {doubtLoading && <LoadingSpinner />}
          {!doubtLoading && doubts.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No doubts posted yet.{' '}
              <Link to="/doubts/new" className="underline">
                Ask one
              </Link>
              .
            </p>
          )}
          <div className="space-y-2">
            {doubts.map((d) => {
              const status = statusFor(d);
              return (
                <Link
                  key={d._id}
                  to={`/doubts/${d._id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600"
                >
                  <span className="flex items-center gap-2">
                    <span className={`badge ${status.cls}`}>{status.label}</span>
                    <span className="font-medium">{d.title}</span>
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
