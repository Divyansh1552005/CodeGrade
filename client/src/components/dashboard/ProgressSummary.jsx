import { Flame } from 'lucide-react';
import { ErrorState, Icon, Panel, PanelBody, PanelHeader, Progress, Skeleton } from '../ui/index.js';

/** Level, XP toward the next level and streak, as plain numbers with a thin bar. */
export default function ProgressSummary({ stats, loading, error, onRetry }) {
  const percent = stats?.xpForNextLevel ? (100 * stats.xpIntoLevel) / stats.xpForNextLevel : 0;
  return (
    <Panel aria-label="Your progress">
      <PanelHeader title="Your progress" />
      <PanelBody className="space-y-4">
        {error && <ErrorState message={error} onRetry={onRetry} />}
        {loading && !stats && <div role="status" aria-label="Loading progress" className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-1 w-full" /><Skeleton className="h-4 w-2/3" /></div>}
        {stats && (
          <>
            <div>
              <p className="flex items-baseline gap-2 text-lg font-semibold tabular-nums">
                <span>Level {stats.level ?? 1}</span>
                <span className="text-base font-normal text-fg-muted">{stats.xp ?? 0} XP</span>
              </p>
              <Progress className="mt-2" value={percent} label="XP toward next level" />
              <p className="mt-2 text-sm text-fg-muted tabular-nums">{stats.xpIntoLevel ?? 0} / {stats.xpForNextLevel ?? 100} XP to level {(stats.level ?? 1) + 1}</p>
            </div>
            <div className="border-t border-border pt-4">
              <p className="flex items-center gap-2 text-base font-medium tabular-nums">
                <Icon as={Flame} className="text-fg-muted" />
                {stats.currentStreak ?? 0} day streak
                <span className="font-normal text-fg-muted">Best {stats.longestStreak ?? 0}</span>
              </p>
              <p className="mt-1 text-sm text-fg-muted">A successful solve each UTC day keeps the streak going.</p>
            </div>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
