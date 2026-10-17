import { Link } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCachedQuery } from '../api/useCachedQuery.js';
import Badges from '../components/dashboard/Badges.jsx';
import ProgressBreakdown from '../components/dashboard/ProgressBreakdown.jsx';
import RecentSubmissions from '../components/dashboard/RecentSubmissions.jsx';
import { doubtStatus } from '../lib/doubtStatus.js';
import {
  Avatar, Badge, Button, EmptyState, ErrorState, PageHeader, Panel, PanelBody, TBody, Table, TableSkeleton, Td, Th, THead, Tr,
} from '../components/ui/index.js';

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';

  const stats = useCachedQuery('/problems/stats/counts');
  const problems = useCachedQuery('/problems', { enabled: isStudent });
  const progress = useCachedQuery('/activity/progress', { key: `progress:${user._id}`, enabled: isStudent });
  const subs = useCachedQuery('/submissions', { enabled: isStudent });
  const doubts = useCachedQuery('/doubts?mine=1', { enabled: isStudent });

  const p = progress.data?.progress;
  const doubtList = doubts.data?.doubts ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" />
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-md font-semibold">{user.name}</p>
          <p className="break-all text-base text-fg-muted">{user.email}</p>
        </div>
        <Badge className="ml-2 capitalize">{user.role}</Badge>
      </div>

      {stats.error && <ErrorState message={stats.error} onRetry={stats.refetch} />}
      <Panel aria-label="Summary">
        <PanelBody>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {isStudent ? (
              <>
                <Stat label="Solved" value={p && stats.data ? `${p.solvedCount}/${stats.data.total}` : '-'} />
                <Stat label="Level" value={p?.level ?? '-'} />
                <Stat label="XP" value={p?.xp ?? '-'} />
                <Stat label="Day streak" value={p?.currentStreak ?? '-'} />
              </>
            ) : (
              <Stat label="Problems in the library" value={stats.data?.total ?? '-'} />
            )}
          </dl>
        </PanelBody>
      </Panel>

      {isStudent && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ProgressBreakdown problems={problems.data?.problems ?? []} loading={problems.loading} error={problems.error} onRetry={problems.refetch} />
          </div>
          <Badges badges={p?.badges} />
          <RecentSubmissions title="Submissions" limit={50} showAll={false} submissions={subs.data?.submissions ?? []} loading={subs.loading} error={subs.error} onRetry={subs.refetch} />

          <section aria-labelledby="my-doubts">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="my-doubts" className="text-md font-semibold">Doubts</h2>
              <Link to="/doubts/new" className="rounded-sm text-sm text-accent-text hover:underline">Ask a doubt</Link>
            </div>
            {doubts.error && <ErrorState message={doubts.error} onRetry={doubts.refetch} />}
            {doubts.loading && !doubts.data && <TableSkeleton rows={3} columns={3} />}
            {!doubts.loading && !doubts.error && doubtList.length === 0 && (
              <EmptyState icon={MessagesSquare} title="No doubts yet" description="Ask a question and a teacher will review the answer before you see it." action={<Button variant="primary" to="/doubts/new">Ask a doubt</Button>} />
            )}
            {doubtList.length > 0 && (
              <Table aria-label="Your doubts">
                <THead>
                  <Tr className="hover:bg-transparent">
                    <Th>Title</Th>
                    <Th>Status</Th>
                    <Th className="hidden sm:table-cell">Asked</Th>
                  </Tr>
                </THead>
                <TBody>
                  {doubtList.map((d) => {
                    const status = doubtStatus(d);
                    return (
                      <Tr key={d._id}>
                        <Td><Link to={`/doubts/${d._id}`} className="block max-w-xs truncate rounded-sm font-medium hover:text-accent-text hover:underline sm:max-w-md">{d.title}</Link></Td>
                        <Td><Badge tone={status.tone}>{status.label}</Badge></Td>
                        <Td className="hidden whitespace-nowrap text-fg-muted sm:table-cell">{new Date(d.createdAt).toLocaleString()}</Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
