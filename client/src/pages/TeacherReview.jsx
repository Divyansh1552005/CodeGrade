import { memo, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';
import Markdown from '../components/Markdown.jsx';
import MarkdownEditor from '../components/MarkdownEditor.jsx';

export default function TeacherReview() {
  const pending = useCachedQuery('/answers?state=pending', { key: 'answers:pending' });
  const failed = useCachedQuery('/doubts/failed', { key: 'doubts:failed' });

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
      <h1 className="mb-4 text-xl font-semibold">Review Queue</h1>
      {loading && <p className="text-slate-400 dark:text-slate-500">Loading…</p>}

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
          {!pending.loading && answers.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">Nothing pending. 🎉</p>
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
          {!failed.loading && failedDoubts.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">No AI failures to handle.</p>
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
        <MarkdownEditor value={content} onChange={setContent} minH="min-h-28" autoGrow />
      </div>
      <label className="field">
        Review notes (optional)
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {err && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={busy} onClick={() => doreview('approve')}>
          Approve
        </button>
        <button
          className="btn bg-red-600 text-white hover:bg-red-500 dark:bg-red-600 dark:text-white dark:hover:bg-red-500"
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
        <span className="badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
          AI draft failed
        </span>
      </div>
      <h3 className="font-semibold">{doubt.title}</h3>
      <div className="mt-1 rounded-md bg-slate-50 p-2 dark:bg-slate-800">
        <Markdown>{doubt.body}</Markdown>
      </div>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        by {doubt.studentId?.name || 'student'}
      </p>

      <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
        AI failed to generate a draft answer for this doubt. Write one manually — it
        will be published to the student immediately.
      </p>

      <div className="field mt-2">
        <span>Your answer (markdown)</span>
        <MarkdownEditor value={content} onChange={setContent} minH="min-h-28" autoGrow />
      </div>

      {err && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
      <button className="btn" disabled={busy} onClick={submit}>
        {busy ? 'Publishing…' : 'Write Answer Manually'}
      </button>
    </div>
  );
});
