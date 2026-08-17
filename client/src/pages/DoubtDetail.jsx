import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Markdown from '../components/Markdown.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function DoubtDetail() {
  const { id } = useParams();
  const [doubt, setDoubt] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [d, a] = await Promise.all([
          api.get(`/doubts/${id}`),
          api.get(`/doubts/${id}/answer`),
        ]);
        if (!active) return;
        setDoubt(d.data.doubt);
        setAnswer(a.data.answer); // null if no approved answer yet
      } catch (err) {
        if (active) setError(err.response?.data?.error || 'Failed to load doubt');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <LoadingSpinner full />;
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!doubt) return null;

  const failed = doubt.aiDraftStatus === 'failed';
  const irrelevant = doubt.aiDraftStatus === 'irrelevant';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link
          to="/doubts"
          className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          ← Back to board
        </Link>
      </div>

      {/* The doubt */}
      <div className="card">
        <h1 className="text-2xl font-semibold">{doubt.title}</h1>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Asked by {doubt.studentId?.name || 'student'}
        </p>
        <div className="mt-3">
          <Markdown>{doubt.body}</Markdown>
        </div>
      </div>

      {/* The answer, or a status message */}
      {answer ? (
        <div className="card border-green-200 dark:border-green-900/60">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="badge bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
              Approved answer
            </span>
            <span className="badge">
              {answer.source === 'ai' ? 'AI-drafted' : 'Teacher-written'}
            </span>
            {answer.reviewedBy?.name && (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {answer.source === 'ai' ? 'Approved by ' : 'Answered by '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {answer.reviewedBy.name}
                </span>
              </span>
            )}
          </div>
          <Markdown>{answer.content}</Markdown>
        </div>
      ) : (
        <div className="card">
          {irrelevant ? (
            <p className="text-sm text-purple-700 dark:text-purple-400">
              This doesn't look like a programming question, so no AI draft was generated —
              a teacher can still answer it manually.
            </p>
          ) : failed ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              AI failed to generate a draft answer — awaiting a manual answer from a teacher.
            </p>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Awaiting teacher response.</p>
          )}
        </div>
      )}
    </div>
  );
}
