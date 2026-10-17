import { memo } from 'react';
import { CheckCircle2, ChevronRight, XCircle } from 'lucide-react';
import Markdown from '../Markdown.jsx';
import { CodeBlock, ErrorState, Icon, Skeleton, StatusBadge } from '../ui/index.js';
import { verdictOf } from '../../lib/submissionStatus.js';
import { cn } from '../../lib/cn.js';

/**
 * Verdict first, then per-test-case results (passed cases collapsed, the first
 * failure expanded), then the AI feedback in its own labelled section.
 */
const SubmissionResult = memo(function SubmissionResult({ submission }) {
  const { passCount, totalCount, testResults, aiFeedback, status } = submission;
  const verdict = verdictOf(submission);

  if (status === 'queued' || status === 'running') {
    return (
      <div role="status" className="flex items-center gap-3">
        <StatusBadge status={status} />
        <span className="text-base text-fg-muted">{status === 'queued' ? 'Submission queued. Waiting for grading…' : 'Grading your submission…'}</span>
      </div>
    );
  }
  if (status === 'error') {
    return <ErrorState message={submission.error || 'Grading failed. Resubmit your solution to try again.'} />;
  }

  const results = testResults || [];
  const firstFailure = results.findIndex((r) => !r.passed);

  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={verdict} />
        <span className="tabular-nums text-base">{passCount}/{totalCount} passed</span>
      </div>

      {results.length > 0 && (
        <section aria-label="Test cases" className="divide-y divide-border rounded-lg border border-border">
          {results.map((r, i) => (
            <details key={i} open={i === firstFailure} className="group">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 px-3 text-base marker:hidden hover:bg-subtle [&::-webkit-details-marker]:hidden">
                <Icon as={ChevronRight} className="text-fg-subtle transition-transform group-open:rotate-90" />
                <span>Test case {i + 1}</span>
                <span className={cn('ml-auto inline-flex items-center gap-1 text-sm', r.passed ? 'text-success' : 'text-danger')}>
                  <Icon as={r.passed ? CheckCircle2 : XCircle} />{r.passed ? 'Passed' : 'Failed'}
                </span>
              </summary>
              <div className="grid gap-3 border-t border-border p-3 @xl:grid-cols-3">
                <CodeBlock label="Input">{r.input}</CodeBlock>
                <CodeBlock label="Expected" tone={r.passed ? 'neutral' : 'success'}>{r.expectedOutput}</CodeBlock>
                <CodeBlock label="Actual" tone={r.passed ? 'neutral' : 'danger'}>{r.actualOutput}</CodeBlock>
              </div>
            </details>
          ))}
        </section>
      )}

      <AiFeedback submission={submission} />
    </div>
  );
});

export default SubmissionResult;

function AiFeedback({ submission }) {
  const { aiFeedback, feedbackStatus } = submission;
  return (
    <section aria-labelledby="ai-feedback-heading">
      <h3 id="ai-feedback-heading" className="mb-2 border-b border-border pb-2 text-md font-semibold">AI feedback</h3>
      {aiFeedback ? (
        <div className="space-y-4">
          <Markdown>{aiFeedback.summary}</Markdown>
          <div className="grid gap-4 @xl:grid-cols-2">
            <FeedbackList title="Strengths" items={aiFeedback.strengths} empty="No specific strengths noted." />
            <FeedbackList title="Improvements" items={aiFeedback.improvements} empty="No improvements suggested." />
          </div>
          {aiFeedback.complexityNote && (
            <div>
              <h4 className="mb-1 text-base font-medium">Complexity</h4>
              <Markdown>{aiFeedback.complexityNote}</Markdown>
            </div>
          )}
        </div>
      ) : ['pending', 'running'].includes(feedbackStatus) ? (
        <div role="status" className="space-y-2">
          <p className="text-base text-fg-muted">AI feedback is being prepared. Your test results are ready.</p>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : (
        <p className="text-base text-fg-muted">AI feedback was not available for this submission.</p>
      )}
    </section>
  );
}

function FeedbackList({ title, items, empty }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div>
      <h4 className="mb-1 text-base font-medium">{title}</h4>
      {list.length === 0 ? (
        <p className="text-base text-fg-muted">{empty}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 marker:text-fg-subtle">
          {list.map((item, i) => <li key={i}><Markdown>{item}</Markdown></li>)}
        </ul>
      )}
    </div>
  );
}
