import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { Button, EmptyState, ErrorState, StatusBadge, TBody, Table, TableSkeleton, Td, Th, THead, Tr } from '../ui/index.js';
import { verdictOf } from '../../lib/submissionStatus.js';
import { LANGUAGE_LABELS } from '../../data/starterTemplates.js';

/** Latest submissions across problems. `title`, `limit` and `showAll` let the profile reuse it for the full history. */
export default function RecentSubmissions({ submissions, loading, error, onRetry, title = 'Recent submissions', limit = 5, showAll = true }) {
  const recent = submissions.slice(0, limit);
  return (
    <section aria-labelledby="submissions-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="submissions-heading" className="text-md font-semibold">{title}</h2>
        {showAll && submissions.length > 0 && <Link to="/profile" className="rounded-sm text-sm text-accent-text hover:underline">All submissions</Link>}
      </div>
      {error && <ErrorState message={error} onRetry={onRetry} />}
      {loading && !error && <TableSkeleton rows={3} columns={4} />}
      {!loading && !error && recent.length === 0 && (
        <EmptyState icon={History} title="No submissions yet" description="Solve a problem to see your history here." action={<Button variant="primary" to="/problems">Browse problems</Button>} />
      )}
      {!loading && recent.length > 0 && (
        <Table aria-label={title}>
          <THead>
            <Tr className="hover:bg-transparent">
              <Th>Problem</Th>
              <Th>Status</Th>
              <Th numeric>Passed</Th>
              <Th className="hidden sm:table-cell">Language</Th>
              <Th className="hidden sm:table-cell">Submitted</Th>
            </Tr>
          </THead>
          <TBody>
            {recent.map((s) => {
              const id = s.problemId?._id || s.problemId;
              return (
                <Tr key={s._id}>
                  <Td>
                    {id ? <Link to={`/submit/${id}`} className="block max-w-32 truncate sm:max-w-xs rounded-sm font-medium hover:text-accent-text hover:underline">{s.problemId?.title || 'Problem'}</Link> : <span className="text-fg-muted">Removed problem</span>}
                  </Td>
                  <Td><StatusBadge status={verdictOf(s)} /></Td>
                  <Td numeric>{s.status === 'graded' ? `${s.passCount}/${s.totalCount}` : '-'}</Td>
                  <Td className="hidden sm:table-cell">{LANGUAGE_LABELS[s.language] || s.language}</Td>
                  <Td className="hidden whitespace-nowrap text-fg-muted sm:table-cell">{new Date(s.createdAt).toLocaleString()}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
      {submissions.length > recent.length && <p className="mt-2 text-sm text-fg-muted">Showing the latest {recent.length} of {submissions.length}.</p>}
    </section>
  );
}
