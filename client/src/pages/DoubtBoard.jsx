import { memo } from 'react';
import { Link } from 'react-router-dom';
import { MessagesSquare, Plus } from 'lucide-react';
import { usePaginatedQuery } from '../api/usePaginatedQuery.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { doubtStatus } from '../lib/doubtStatus.js';
import { Badge, Button, EmptyState, ErrorState, Icon, PageHeader, TBody, Table, TableSkeleton, Td, Th, THead, Tr } from '../components/ui/index.js';

// Plain-text excerpt of a markdown body, truncated for the list view.
function excerpt(body, max = 100) {
  const text = String(body || '')
    .replace(/[#>*_`~\-]/g, ' ') // strip common markdown punctuation
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export default function DoubtBoard() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const { items: doubts, loading, loadingMore, hasMore, error, loadMore, refetch } = usePaginatedQuery('/doubts', 'doubts');

  return (
    <div>
      <PageHeader
        title="Doubts"
        action={isStudent && <Button variant="primary" to="/doubts/new"><Icon as={Plus} />Ask a doubt</Button>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      {loading && <TableSkeleton rows={6} columns={3} />}
      {!loading && !error && doubts.length === 0 && (
        <EmptyState
          icon={MessagesSquare}
          title="No doubts yet"
          description={isStudent ? 'Ask a programming question. A teacher reviews every answer before it is shared.' : 'Doubts students ask will appear here.'}
          action={isStudent ? <Button variant="primary" to="/doubts/new">Ask a doubt</Button> : undefined}
        />
      )}
      {!loading && doubts.length > 0 && (
        <Table aria-label="Doubts">
          <THead>
            <Tr className="hover:bg-transparent">
              <Th>Doubt</Th>
              <Th>Status</Th>
              <Th className="hidden sm:table-cell">Asked by</Th>
              <Th className="hidden md:table-cell">Asked</Th>
            </Tr>
          </THead>
          <TBody>
            {doubts.map((d) => <DoubtRow key={d._id} doubt={d} role={user.role} />)}
          </TBody>
        </Table>
      )}
      {hasMore && !loading && (
        <div className="mt-3 flex justify-center">
          <Button onClick={loadMore} loading={loadingMore}>Load more</Button>
        </div>
      )}
    </div>
  );
}

const DoubtRow = memo(function DoubtRow({ doubt, role }) {
  const status = doubtStatus(doubt, role);
  return (
    <Tr>
      <Td className="h-auto py-2">
        <Link to={`/doubts/${doubt._id}`} className="block max-w-xs rounded-sm sm:max-w-md lg:max-w-xl">
          <span className="block truncate font-medium hover:text-accent-text hover:underline">{doubt.title}</span>
          <span className="block truncate text-sm text-fg-muted">{excerpt(doubt.body)}</span>
        </Link>
      </Td>
      <Td><Badge tone={status.tone}>{status.label}</Badge></Td>
      <Td className="hidden whitespace-nowrap text-fg-muted sm:table-cell">{doubt.studentId?.name || 'Student'}</Td>
      <Td className="hidden whitespace-nowrap text-fg-muted md:table-cell">{doubt.createdAt ? new Date(doubt.createdAt).toLocaleDateString() : ''}</Td>
    </Tr>
  );
});
