import { PageHeader, ErrorState } from '../components/UI.jsx';
import { useParams } from 'react-router-dom';
import { useCachedQuery } from '../api/useCachedQuery.js';
import Markdown from '../components/Markdown.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function DoubtDetail() {
  const { id } = useParams();
  const doubtQuery = useCachedQuery(`/doubts/${id}`, { refetchInterval: 5000 });
  const answerQuery = useCachedQuery(`/doubts/${id}/answer`, { refetchInterval: 5000 });
  const doubt = doubtQuery.data?.doubt;
  const answer = answerQuery.data?.answer;
  const loading = doubtQuery.loading || answerQuery.loading;
  const error = doubtQuery.error || answerQuery.error;

  if (loading) return <LoadingSpinner full />;
  if (error) return <ErrorState message={error} onRetry={() => { doubtQuery.refetch(); answerQuery.refetch(); }} />;
  if (!doubt) return null;

  const failed = doubt.aiDraftStatus === 'failed';
  const irrelevant = doubt.aiDraftStatus === 'irrelevant';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader eyebrow="Conversation" title={doubt.title} description={`Asked by ${doubt.studentId?.name || 'student'}`} backTo="/doubts" backLabel="Doubt board" />
      {/* The doubt */}
      <div className="card">
        <h2 className="section-title mb-4">The question</h2>
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
            <p className="text-sm text-slate-500 dark:text-slate-400">{doubt.aiDraftStatus === 'pending' ? 'Preparing an AI draft for teacher review…' : 'Awaiting teacher response.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
