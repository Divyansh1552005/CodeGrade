import { memo, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCheck, MessagesSquare } from 'lucide-react';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';
import Markdown from '../components/Markdown.jsx';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
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

  const afterOffTopic = useCallback(() => {
    invalidate('answers:pending');
    invalidate('doubts:failed');
    pending.refetch();
    failed.refetch();
  }, [pending, failed]);

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
        {answers.map((a) => <ReviewCard key={a._id} answer={a} onReviewed={afterReview} onOffTopic={afterOffTopic} />)}
        {!pending.loading && !pending.error && answers.length === 0 && (
          <EmptyState icon={CheckCheck} title="Nothing to review" description="New drafts appear here when students ask questions." />
        )}
      </section>

      <section className="space-y-4" aria-labelledby="manual-heading">
        <h2 id="manual-heading" className="text-md font-semibold">Needs a manual answer</h2>
        {failed.loading && !failed.data && <div role="status" aria-label="Loading doubts" className="space-y-3"><Skeleton className="h-32 w-full" /></div>}
        {failedDoubts.map((d) => <FailedDoubtCard key={d._id} doubt={d} onAnswered={afterManualAnswer} onOffTopic={afterOffTopic} />)}
        {!failed.loading && !failed.error && failedDoubts.length === 0 && (
          <EmptyState icon={MessagesSquare} title="No questions need a manual answer" description="Questions that need your direct answer appear here." />
        )}
      </section>
    </div>
  );
}

// "Mark off topic": removes the doubt from the board, tells the student, and lets them appeal once.
function useMarkOffTopic(doubtId, onDone) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/doubts/${doubtId}/off-topic`);
      toast.success('Doubt marked off topic. The student has been told.');
      setOpen(false);
      onDone();
    } catch (e) {
      const msg = e.response?.data?.error || 'Could not mark the doubt off topic. Check your connection and try again.';
      setError(msg);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  return { open, setOpen, busy, error, confirm };
}

function OffTopicDialog({ state }) {
  return (
    <ConfirmDialog
      open={state.open}
      onClose={() => !state.busy && state.setOpen(false)}
      onConfirm={state.confirm}
      busy={state.busy}
      title="Mark this doubt off topic?"
      message="It will be removed from the doubts board and the student will be told. They can ask for a review once."
      confirmLabel="Mark off topic"
    />
  );
}

function Question({ body }) {
  return <div className="border-l-2 border-border pl-3"><Markdown>{body}</Markdown></div>;
}

const ReviewCard = memo(function ReviewCard({ answer, onReviewed, onOffTopic }) {
  const offTopic = useMarkOffTopic(answer.doubtId?._id, onOffTopic);
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
      <PanelHeader title={answer.doubtId?.title || 'Doubt'} action={<>
        {answer.doubtId?.appealed && <Badge tone="warning">Appealed</Badge>}
        {answer.doubtId?.triage?.lowConfidence && <Badge tone="info" title="The AI was not confident this doubt is relevant.">Low confidence</Badge>}
        <Badge>{answer.source === 'ai' ? 'AI draft' : answer.source}</Badge><Badge tone="warning">{answer.state}</Badge>
      </>} />
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
          {answer.doubtId?._id && <Button disabled={Boolean(busy)} onClick={() => offTopic.setOpen(true)}>Mark off topic</Button>}
        </div>
        {(err || offTopic.error) && <ErrorState message={err || offTopic.error} />}
        <OffTopicDialog state={offTopic} />
      </PanelBody>
    </Panel>
  );
});

const FailedDoubtCard = memo(function FailedDoubtCard({ doubt, onAnswered, onOffTopic }) {
  const offTopic = useMarkOffTopic(doubt._id, onOffTopic);
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
      <PanelHeader title={doubt.title} action={<>
        {doubt.appealed && <Badge tone="warning">Appealed</Badge>}
        {doubt.triage?.lowConfidence && <Badge tone="info" title="The AI was not confident this doubt is relevant.">Low confidence</Badge>}
        {!doubt.appealed && (irrelevant ? <Badge>Off topic</Badge> : <Badge tone="danger">AI draft failed</Badge>)}
      </>} />
      <PanelBody className="space-y-4">
        <p className="text-sm text-fg-muted">Asked by {doubt.studentId?.name || 'a student'}</p>
        <Question body={doubt.body} />
        <p className="text-base text-fg-muted">
          {doubt.appealed
            ? 'The AI marked this doubt off topic and the student appealed. No AI draft was made. Read it and answer it yourself if it is relevant. Your answer is published to the student immediately.'
            : irrelevant
              ? 'The AI judged this is not about programming, so it wrote no draft. Answer it manually if it is relevant.'
              : 'The AI could not draft an answer. Your answer is published to the student immediately.'}
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Your answer</span>
          <MarkdownEditor value={content} onChange={setContent} label="Answer content" minH="min-h-28" autoGrow />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={busy} onClick={submit}>Publish answer</Button>
          <Button disabled={busy} onClick={() => offTopic.setOpen(true)}>Mark off topic</Button>
        </div>
        {(err || offTopic.error) && <ErrorState message={err || offTopic.error} />}
        <OffTopicDialog state={offTopic} />
      </PanelBody>
    </Panel>
  );
});
