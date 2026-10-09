import { PageHeader, EmptyState, ErrorState } from '../components/UI.jsx';
import { memo, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';
import Markdown from '../components/Markdown.jsx';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function TeacherReview() {
  const pending = useCachedQuery('/answers?state=pending', { key: 'answers:pending', refetchInterval: 5000 });
  const failed = useCachedQuery('/doubts/failed', { key: 'doubts:failed', refetchInterval: 5000 });

  const answers = pending.data?.answers ?? [];
  const failedDoubts = failed.data?.doubts ?? [];

  const afterReview = useCallback(() => {
    invalidate('answers:pending');
    pending.refetch();
  }, [pending]);

  const afterManualAnswer = useCallback(() => {
    invalidate('doubts:failed');
    failed.refetch();
  }, [failed]);

  const loading = pending.loading || failed.loading;

  return (
    <div>
      <PageHeader eyebrow="Teaching workspace" title="Review queue" description="Add your expertise to every answer. Review drafts carefully before publishing them to students." action={<span className="badge badge-warning">{answers.length} awaiting review</span>} />
      {(pending.error || failed.error) && <ErrorState message={pending.error || failed.error} onRetry={() => { pending.refetch(); failed.refetch(); }} />}
      {loading && <LoadingSpinner />}

      {/* AI drafts awaiting approval */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          AI drafts awaiting approval
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Students only ever see an answer once it is approved.
        </p>
        <div className="space-y-4">
          {answers.map((a) => (
            <ReviewCard key={a._id} answer={a} onReviewed={afterReview} />
          ))}
          {!pending.loading && !pending.error && answers.length === 0 && (
            <EmptyState icon="check" title="You’re all caught up" description="New drafts will appear here when students ask questions." />
          )}
        </div>
      </section>

      {/* Doubts where the AI failed — need a manual answer */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Needs a manual answer
        </h2>
        <div className="space-y-4">
          {failedDoubts.map((d) => (
            <FailedDoubtCard key={d._id} doubt={d} onAnswered={afterManualAnswer} />
          ))}
          {!failed.loading && !failed.error && failedDoubts.length === 0 && (
            <EmptyState icon="chat" title="No questions need a manual answer" description="Questions that need your direct support will appear here." />
          )}
        </div>
      </section>
    </div>
  );
}

const ReviewCard = memo(function ReviewCard({ answer, onReviewed }) {
  const [content, setContent] = useState(answer.content);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const doreview = useCallback(
    async (action) => {
      setBusy(true);
      setErr('');
      try {
        await api.patch(`/answers/${answer._id}/${action}`, { content, reviewNotes: notes });
        onReviewed();
        toast.success(action === 'approve' ? 'Answer approved.' : 'Answer rejected.');
      } catch (e) {
        const msg = e.response?.data?.error || 'Action failed';
        setErr(msg);
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    },
    [answer._id, content, notes, onReviewed]
  );

  return (
    <div className="card">
      <div className="mb-2 flex items-center gap-2">
        <span className="badge">{answer.source}</span>
        <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
          {answer.state}
        </span>
      </div>
      <h3 className="font-semibold">{answer.doubtId?.title || 'Doubt'}</h3>
      {answer.doubtId?.body && (
        <div className="mt-1 rounded-md bg-slate-50 p-2 dark:bg-slate-800">
          <Markdown>{answer.doubtId.body}</Markdown>
        </div>
      )}

      <div className="field mt-3">
        <span>Draft answer (editable, markdown)</span>
        <MarkdownEditor value={content} onChange={setContent} label="Answer content" minH="min-h-28" autoGrow />
      </div>
      <label className="field">
        Review notes (optional)
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {err && <ErrorState message={err} />}
      <div className="flex gap-2">
        <button className="btn" disabled={busy} onClick={() => doreview('approve')}>
          Approve
        </button>
        <button
          className="btn-secondary !border-rose-200 !text-rose-600 hover:!bg-rose-50 dark:!border-rose-900 dark:!text-rose-300 dark:hover:!bg-rose-500/10"
          disabled={busy}
          onClick={() => doreview('reject')}
        >
          Reject
        </button>
      </div>
    </div>
  );
});

const FailedDoubtCard = memo(function FailedDoubtCard({ doubt, onAnswered }) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const irrelevant = doubt.aiDraftStatus === 'irrelevant';

  const submit = useCallback(async () => {
    if (!content.trim()) {
      setErr('Answer cannot be empty');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      // Manual answer -> created as source:'teacher', state:'approved'.
      await api.post('/answers', { doubtId: doubt._id, content });
      onAnswered();
      toast.success('Answer published to the student.');
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to submit answer';
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [content, doubt._id, onAnswered]);

  return (
    <div className="card border-amber-200 dark:border-amber-900/60">
      <div className="mb-2">
        {irrelevant ? (
          <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">
            Flagged as off-topic
          </span>
        ) : (
          <span className="badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
            AI draft failed
          </span>
        )}
      </div>
      <h3 className="font-semibold">{doubt.title}</h3>
      <div className="mt-1 rounded-md bg-slate-50 p-2 dark:bg-slate-800">
        <Markdown>{doubt.body}</Markdown>
      </div>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        by {doubt.studentId?.name || 'student'}
      </p>

      <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
        {irrelevant
          ? "The AI judged this doubt isn't related to programming, so no draft was generated. Write an answer manually if it's actually relevant, or reject/ignore otherwise."
          : 'AI failed to generate a draft answer for this doubt. Write one manually — it will be published to the student immediately.'}
      </p>

      <div className="field mt-2">
        <span>Your answer (markdown)</span>
        <MarkdownEditor value={content} onChange={setContent} label="Answer content" minH="min-h-28" autoGrow />
      </div>

      {err && <ErrorState message={err} />}
      <button className="btn" disabled={busy} onClick={submit}>
        {busy ? 'Publishing…' : 'Write Answer Manually'}
      </button>
    </div>
  );
});
