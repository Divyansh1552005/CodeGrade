import { Fragment, memo, useState } from 'react';
import { ChevronRight, History } from 'lucide-react';
import { CodeBlock, EmptyState, Icon, StatusBadge, TBody, Table, Td, Th, THead, Tr } from '../ui/index.js';
import SubmissionResult from './SubmissionResult.jsx';
import { verdictOf } from '../../lib/submissionStatus.js';
import { LANGUAGE_LABELS } from '../../data/starterTemplates.js';
import { cn } from '../../lib/cn.js';

/** Past submissions for the selected problem. A row expands to show the submitted code and its results. */
const SubmissionHistory = memo(function SubmissionHistory({ submissions }) {
  const [openId, setOpenId] = useState(null);
  if (!submissions.length) {
    return <EmptyState icon={History} title="No submissions yet" description="Submit a solution to see your history for this problem here." />;
  }
  return (
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
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : s._id)}
                  className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1"
                >
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
                <td colSpan={4} className="space-y-4 border-t border-border bg-canvas p-4">
                  <CodeBlock label="Submitted code">{s.code}</CodeBlock>
                  <SubmissionResult submission={s} />
                </td>
              </tr>
            )}
            </Fragment>
          );
        })}
      </TBody>
    </Table>
  );
});

export default SubmissionHistory;
