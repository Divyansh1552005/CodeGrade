import { memo, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCheck, MessagesSquare } from 'lucide-react';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';
import Markdown from '../components/Markdown.jsx';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
import { Badge, Button, EmptyState, ErrorState, Field, Input, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '../components/ui/index.js';

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

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Review queue"
        description="Students only see an answer once it is approved."
        action={<Badge tone="warning">{answers.length} awaiting review</Badge>}
      />
      {(pending.error || failed.error) && <ErrorState className="mb-6" message={pending.error || failed.error} onRetry={() => { pending.refetch(); failed.refetch(); }} />}

      <section className="mb-10 space-y-4" aria-labelledby="drafts-heading">
        <h2 id="drafts-heading" className="text-md font-semibold">AI drafts awaiting approval</h2>
        {pending.loading && !pending.data && <div role="status" aria-label="Loading drafts" className="space-y-3"><Skeleton className="h-32 w-full" /></div>}
        {answers.map((a) => <ReviewCard key={a._id} answer={a} onReviewed={afterReview} />)}
        {!pending.loading && !pending.error && answers.length === 0 && (
          <EmptyState icon={CheckCheck} title="Nothing to review" description="New drafts appear here when students ask questions." />
        )}
      </section>

      <section className="space-y-4" aria-labelledby="manual-heading">
        <h2 id="manual-heading" className="text-md font-semibold">Needs a manual answer</h2>
        {failed.loading && !failed.data && <div role="status" aria-label="Loading doubts" className="space-y-3"><Skeleton className="h-32 w-full" /></div>}
        {failedDoubts.map((d) => <FailedDoubtCard key={d._id} doubt={d} onAnswered={afterManualAnswer} />)}
        {!failed.loading && !failed.error && failedDoubts.length === 0 && (
          <EmptyState icon={MessagesSquare} title="No questions need a manual answer" description="Questions that need your direct answer appear here." />
        )}
      </section>
    </div>
  );
}

function Question({ body }) {
  return <div className="border-l-2 border-border pl-3"><Markdown>{body}</Markdown></div>;
}

const ReviewCard = memo(function ReviewCard({ answer, onReviewed }) {
  const [content, setContent] = useState(answer.content);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const doreview = useCallback(
    async (action) => {
      setBusy(action);
      setErr('');
      try {
        await api.patch(`/answers/${answer._id}/${action}`, { content, reviewNotes: notes });
        onReviewed();
        toast.success(action === 'approve' ? 'Answer approved.' : 'Answer rejected.');
      } catch (e) {
        const msg = e.response?.data?.error || 'Action failed. Check your connection and try again.';
        setErr(msg);
        toast.error(msg);
      } finally {
        setBusy('');
      }
    },
    [answer._id, content, notes, onReviewed]
  );

  return (
    <Panel aria-label={answer.doubtId?.title || 'Doubt'}>
      <PanelHeader title={answer.doubtId?.title || 'Doubt'} action={<><Badge>{answer.source === 'ai' ? 'AI draft' : answer.source}</Badge><Badge tone="warning">{answer.state}</Badge></>} />
      <PanelBody className="space-y-4">
        {answer.doubtId?.body && <Question body={answer.doubtId.body} />}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Draft answer</span>
          <MarkdownEditor value={content} onChange={setContent} label="Answer content" minH="min-h-28" autoGrow />
        </div>
        <Field label="Review notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex gap-2">
          <Button variant="primary" loading={busy === 'approve'} disabled={Boolean(busy)} onClick={() => doreview('approve')}>Approve</Button>
          <Button variant="danger" loading={busy === 'reject'} disabled={Boolean(busy)} onClick={() => doreview('reject')}>Reject</Button>
        </div>
        {err && <ErrorState message={err} />}
      </PanelBody>
    </Panel>
  );
});

const FailedDoubtCard = memo(function FailedDoubtCard({ doubt, onAnswered }) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const irrelevant = doubt.aiDraftStatus === 'irrelevant';

  const submit = useCallback(async () => {
    if (!content.trim()) {
      setErr('Write an answer before publishing.');
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
      const msg = e.response?.data?.error || 'Failed to publish the answer. Check your connection and try again.';
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [content, doubt._id, onAnswered]);

  return (
    <Panel aria-label={doubt.title}>
      <PanelHeader title={doubt.title} action={irrelevant ? <Badge>Off topic</Badge> : <Badge tone="danger">AI draft failed</Badge>} />
      <PanelBody className="space-y-4">
        <p className="text-sm text-fg-muted">Asked by {doubt.studentId?.name || 'a student'}</p>
        <Question body={doubt.body} />
        <p className="text-base text-fg-muted">
          {irrelevant
            ? 'The AI judged this is not about programming, so it wrote no draft. Answer it manually if it is relevant.'
            : 'The AI could not draft an answer. Your answer is published to the student immediately.'}
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Your answer</span>
          <MarkdownEditor value={content} onChange={setContent} label="Answer content" minH="min-h-28" autoGrow />
        </div>
        <Button variant="primary" loading={busy} onClick={submit}>Publish answer</Button>
        {err && <ErrorState message={err} />}
      </PanelBody>
    </Panel>
  );
});
