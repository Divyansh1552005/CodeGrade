import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { Button, EmptyState, ErrorState, TableSkeleton } from '../ui/index.js';
import SubmissionsTable from '../SubmissionsTable.jsx';

/** The latest few submissions (the Dashboard asks the server for five). The full history is paged on the profile. */
export default function RecentSubmissions({ submissions, loading, error, onRetry }) {
  return (
    <section aria-labelledby="submissions-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="submissions-heading" className="text-md font-semibold">Recent submissions</h2>
        {submissions.length > 0 && <Link to="/profile" className="rounded-sm text-sm text-accent-text hover:underline">All submissions</Link>}
      </div>
      {error && <ErrorState message={error} onRetry={onRetry} />}
      {loading && !error && <TableSkeleton rows={3} columns={4} />}
      {!loading && !error && submissions.length === 0 && (
        <EmptyState icon={History} title="No submissions yet" description="Solve a problem to see your history here." action={<Button variant="primary" to="/problems">Browse problems</Button>} />
      )}
      {!loading && submissions.length > 0 && <SubmissionsTable submissions={submissions} label="Recent submissions" />}
    </section>
  );
}
