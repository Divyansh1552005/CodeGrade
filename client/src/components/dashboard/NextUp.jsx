import { CheckCircle2 } from 'lucide-react';
import { Button, DifficultyBadge, ErrorState, Icon, Panel, PanelBody, PanelHeader, Skeleton, StatusBadge } from '../ui/index.js';
import { verdictOf } from '../../lib/submissionStatus.js';

/** The student's next step: resume the last unsolved attempt, otherwise start the lowest-numbered unsolved problem. */
export function pickNext(problems, submissions) {
  const last = submissions[0];
  const lastId = last && String(last.problemId?._id || last.problemId || '');
  const lastProblem = lastId && problems.find((p) => p._id === lastId);
  if (last && lastProblem && !lastProblem.solved) return { kind: 'resume', problem: lastProblem, submission: last };
  const unsolved = problems.filter((p) => !p.solved).sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  if (unsolved.length) return { kind: 'start', problem: unsolved[0] };
  return { kind: 'done' };
}

export default function NextUp({ problems, submissions, loading, error, onRetry }) {
  const next = !loading && !error ? pickNext(problems, submissions) : null;
  return (
    <Panel aria-label="Next up">
      <PanelHeader title={next?.kind === 'resume' ? 'Continue where you left off' : 'Next problem'} />
      <PanelBody>
        {error && <ErrorState message={error} onRetry={onRetry} />}
        {loading && <div role="status" aria-label="Loading next problem" className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-9 w-32" /></div>}
        {next?.kind === 'done' && (
          <p className="flex items-center gap-2 text-base text-fg-muted">
            <Icon as={CheckCircle2} className="text-success" />
            {problems.length ? 'You have solved every problem. New problems appear here when a teacher adds them.' : 'No problems yet. They appear here once a teacher adds one.'}
          </p>
        )}
        {next && next.kind !== 'done' && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="truncate text-md font-semibold" title={next.problem.title}>
                {typeof next.problem.number === 'number' && <span className="mr-2 tabular-nums text-fg-muted">{next.problem.number}.</span>}
                {next.problem.title}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                <DifficultyBadge level={next.problem.difficulty || 'easy'} />
                {next.kind === 'resume' && (
                  <>
                    <span>Last submission</span>
                    <StatusBadge status={verdictOf(next.submission)} />
                    {next.submission.status === 'graded' && <span className="tabular-nums">{next.submission.passCount}/{next.submission.totalCount} tests passed</span>}
                  </>
                )}
              </div>
            </div>
            <Button variant="primary" to={`/submit/${next.problem._id}`}>{next.kind === 'resume' ? 'Continue solving' : 'Start solving'}</Button>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
