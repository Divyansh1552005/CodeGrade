import { Fragment, memo, useEffect, useState } from 'react';
import { ChevronRight, History } from 'lucide-react';
import { useCachedQuery } from '../../api/useCachedQuery.js';
import PagedSection from '../PagedSection.jsx';
import { CodeBlock, EmptyState, ErrorState, Icon, Skeleton, StatusBadge, TBody, Table, Td, Th, THead, Tr } from '../ui/index.js';
import SubmissionResult from './SubmissionResult.jsx';
import { verdictOf } from '../../lib/submissionStatus.js';
import { LANGUAGE_LABELS } from '../../data/starterTemplates.js';
import { cn } from '../../lib/cn.js';

// The list rows are light. The code and per-test results are fetched when a row is opened, and refreshed
// while that submission is still being graded.
function SubmissionDetail({ id }) {
  const [settled, setSettled] = useState(false);
  const detail = useCachedQuery(`/submissions/${id}`, { key: `submission-detail:${id}`, refetchInterval: settled ? 0 : 2000, pauseWhenHidden: true });
  const submission = detail.data?.submission;
  const finished = Boolean(submission) && !['queued', 'running'].includes(submission.status) && !['pending', 'running'].includes(submission.feedbackStatus);
  useEffect(() => { if (finished) setSettled(true); }, [finished]); // stop refreshing once graded and its feedback is done
  if (detail.error && !submission) return <ErrorState message={detail.error} onRetry={detail.refetch} />;
  if (!submission) return <div role="status" aria-label="Loading submission" className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-32 w-full" /></div>;
  return (
    <div className="space-y-4">
      <CodeBlock label="Submitted code">{submission.code}</CodeBlock>
      <SubmissionResult submission={submission} />
    </div>
  );
}

/**
 * Past submissions for the selected problem, ten at a time (the list comes from usePagedList in the
 * workspace). A row opens to show the code and results; which row is open is kept by the parent, so it
 * survives refreshes and switching tabs.
 */
const SubmissionHistory = memo(function SubmissionHistory({ list, openId, onOpenChange }) {
  return (
    <PagedSection
      id="problem-submissions" heading="Your submissions" hideHeading label="submissions" list={list} skeletonColumns={4}
      empty={<EmptyState icon={History} title="No submissions yet" description="Submit a solution to see your history for this problem here." />}
    >
      {(submissions) => (
        <Table aria-label="Your submissions">
          <THead>
            <Tr className="hover:bg-transparent">
              <Th>Status</Th>
              <Th numeric>Tests passed</Th>
              <Th>Language</Th>
              <Th>Submitted</Th>
            </Tr>
          </THead>
          <TBody>
            {submissions.map((s) => {
              const open = openId === s._id;
              return (
                <Fragment key={s._id}>
                  <Tr>
                    <Td>
                      <button type="button" aria-expanded={open} onClick={() => onOpenChange(open ? null : s._id)} className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1">
                        <Icon as={ChevronRight} className={cn('text-fg-subtle transition-transform', open && 'rotate-90')} />
                        <StatusBadge status={verdictOf(s)} />
                      </button>
                    </Td>
                    <Td numeric>{s.status === 'graded' ? `${s.passCount}/${s.totalCount}` : '-'}</Td>
                    <Td>{LANGUAGE_LABELS[s.language] || s.language}</Td>
                    <Td className="whitespace-nowrap text-fg-muted">{new Date(s.createdAt).toLocaleString()}</Td>
                  </Tr>
                  {open && (
                    <tr>
                      <td colSpan={4} className="border-t border-border bg-canvas p-4"><SubmissionDetail id={s._id} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </TBody>
        </Table>
      )}
    </PagedSection>
  );
});

export default SubmissionHistory;
