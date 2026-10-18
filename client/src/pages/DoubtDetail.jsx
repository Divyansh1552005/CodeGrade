import { Link, useParams } from 'react-router-dom';
import { Bot, FileSearch, GraduationCap } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCachedQuery } from '../api/useCachedQuery.js';
import Markdown from '../components/Markdown.jsx';
import { doubtStatus } from '../lib/doubtStatus.js';
import { Avatar, Badge, Button, CodeBlock, EmptyState, ErrorState, PageHeader, PageSkeleton, Panel, PanelBody, PanelHeader, Skeleton } from '../components/ui/index.js';

export default function DoubtDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const doubtQuery = useCachedQuery(`/doubts/${id}`, { refetchInterval: 5000 });
  const answerQuery = useCachedQuery(`/doubts/${id}/answer`, { refetchInterval: 5000 });
  const doubt = doubtQuery.data?.doubt;
  const answer = answerQuery.data?.answer;
  const loading = doubtQuery.loading || answerQuery.loading;
  const error = doubtQuery.error || answerQuery.error;

  if (loading) return <PageSkeleton />;
  // A removed doubt, or someone else's doubt that is still being checked, is a 404 for everyone but its owner.
  if (error === 'Doubt not found') {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Doubt not available" backTo="/doubts" backLabel="Doubts" />
        <EmptyState icon={FileSearch} title="This doubt is not available" description="It may have been removed. If you just posted it, check your notifications for the reason." action={<Button variant="primary" to="/doubts">Go to doubts</Button>} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => { doubtQuery.refetch(); answerQuery.refetch(); }} />;
  if (!doubt) return null;

  const status = doubtStatus(doubt, user.role);
  const checking = doubt.status === 'pending_triage';
  const author = doubt.studentId?.name || 'Student';
  const fromAi = answer?.source === 'ai';

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={doubt.title}
        description={doubt.createdAt ? `Asked ${new Date(doubt.createdAt).toLocaleString()}` : undefined}
        action={<Badge tone={status.tone}>{status.label}</Badge>}
        backTo="/doubts"
        backLabel="Doubts"
      />

      <Panel aria-label="Question">
        <PanelHeader>
          <span className="flex min-w-0 items-center gap-2 text-base"><Avatar name={author} size="sm" /><span className="truncate font-medium">{author}</span><span className="text-fg-muted">asked</span></span>
        </PanelHeader>
        <PanelBody className="space-y-4">
          <Markdown>{doubt.body}</Markdown>
          {doubt.code && <CodeBlock label="Code snippet">{doubt.code}</CodeBlock>}
          {doubt.problemId && user.role === 'student' && <Link to={`/submit/${doubt.problemId}`} className="inline-block rounded-sm text-sm text-accent-text hover:underline">Open the related problem</Link>}
        </PanelBody>
      </Panel>

      {checking ? (
        <Panel aria-label="Answer status">
          <PanelBody>
            <div role="status" className="space-y-2">
              <p className="text-base text-fg-muted">We are checking your doubt before it is shared on the board. This usually takes a few seconds.</p>
              <Skeleton className="h-3 w-2/3" />
            </div>
          </PanelBody>
        </Panel>
      ) : answer ? (
        <Panel aria-label="Answer" className="border-success-border">
          <PanelHeader className="flex-wrap">
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Approved answer</Badge>
              {fromAi
                ? <Badge icon={Bot}>AI-drafted</Badge>
                : <Badge tone="accent" icon={GraduationCap}>Teacher-written</Badge>}
            </span>
            {answer.reviewedBy?.name && (
              <span className="text-sm text-fg-muted">{fromAi ? 'Approved by' : 'Answered by'} <span className="font-medium text-fg">{answer.reviewedBy.name}</span></span>
            )}
          </PanelHeader>
          <PanelBody><Markdown>{answer.content}</Markdown></PanelBody>
        </Panel>
      ) : (
        <Panel aria-label="Answer status">
          <PanelBody>
            {doubt.aiDraftStatus === 'irrelevant' ? (
              <p className="text-base text-fg-muted">This doesn't look like a programming question, so no AI draft was generated. A teacher can still answer it.</p>
            ) : doubt.aiDraftStatus === 'failed' ? (
              <p className="text-base text-warning">The AI could not draft an answer. A teacher will answer it manually.</p>
            ) : doubt.aiDraftStatus === 'pending' ? (
              <div role="status" className="space-y-2">
                <p className="text-base text-fg-muted">Preparing an AI draft for teacher review…</p>
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : (
              <p className="text-base text-fg-muted">Waiting for a teacher to review.</p>
            )}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
