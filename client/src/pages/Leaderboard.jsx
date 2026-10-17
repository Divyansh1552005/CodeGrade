import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { TOPICS } from '../data/topics.js';
import { Badge, EmptyState, ErrorState, PageHeader, Select, TBody, Table, TableSkeleton, Td, Th, THead, Tr } from '../components/ui/index.js';
import { cn } from '../lib/cn.js';

export default function Leaderboard() {
  const { user } = useAuth();
  const [topic, setTopic] = useState('');
  const url = topic ? `/leaderboard?scope=topic&topic=${encodeURIComponent(topic)}` : '/leaderboard?scope=global';
  const board = useCachedQuery(url, { key: `leaderboard:${user._id}:${topic}`, refetchInterval: 30000 });
  const entries = board.data?.entries;

  return (
    <div>
      <PageHeader title="Leaderboard" description="Top 20 students by XP." />
      <div className="mb-3 w-full sm:w-56">
        <Select aria-label="Leaderboard scope" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">All topics</option>
          {TOPICS.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </div>
      {board.error && <ErrorState message={board.error} onRetry={board.refetch} />}
      {board.loading && !entries && <TableSkeleton rows={8} columns={4} />}
      {entries?.length === 0 && (
        <EmptyState icon={Trophy} title="No rankings yet" description={topic ? `Nobody has earned XP in ${topic} yet.` : 'Solve a problem to earn XP and appear here.'} />
      )}
      {entries?.length > 0 && (
        <Table aria-label="Leaderboard">
          <THead>
            <Tr className="hover:bg-transparent">
              <Th numeric className="w-16">Rank</Th>
              <Th>User</Th>
              <Th numeric className="hidden sm:table-cell">Level</Th>
              <Th numeric className="hidden sm:table-cell">Solved</Th>
              <Th numeric>XP</Th>
            </Tr>
          </THead>
          <TBody>
            {entries.map((entry, index) => {
              const mine = String(entry.studentId?._id) === String(user._id);
              return (
                <Tr key={entry._id} aria-current={mine ? 'true' : undefined} className={cn(mine && 'bg-accent-subtle hover:bg-accent-subtle')}>
                  <Td numeric className="text-fg-muted">{index + 1}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="max-w-32 truncate font-medium sm:max-w-xs">{entry.studentId?.name}</span>
                      {mine && <Badge tone="accent">You</Badge>}
                    </span>
                  </Td>
                  <Td numeric className="hidden sm:table-cell">{entry.level ?? '-'}</Td>
                  <Td numeric className="hidden sm:table-cell">{entry.solvedCount ?? '-'}</Td>
                  <Td numeric className="font-medium">{entry.xp}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
