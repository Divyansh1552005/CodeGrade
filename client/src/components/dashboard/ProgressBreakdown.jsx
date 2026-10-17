import { useMemo } from 'react';
import { ErrorState, Panel, PanelBody, PanelHeader, Progress, Skeleton } from '../ui/index.js';

const DIFFICULTIES = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const TOPIC_LIMIT = 8;

function Row({ label, solved, total }) {
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-base">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 text-sm tabular-nums text-fg-muted">{solved}/{total}</span>
      </div>
      <Progress value={total ? (100 * solved) / total : 0} label={`${label} solved`} />
    </li>
  );
}

/** Solved versus total by difficulty and by topic, derived from the problem list. */
export default function ProgressBreakdown({ problems, loading, error, onRetry }) {
  const { byDifficulty, byTopic } = useMemo(() => {
    const difficulty = Object.fromEntries(DIFFICULTIES.map(([key]) => [key, { solved: 0, total: 0 }]));
    const topics = new Map();
    for (const p of problems) {
      const bucket = difficulty[p.difficulty || 'easy'];
      if (bucket) { bucket.total += 1; if (p.solved) bucket.solved += 1; }
      for (const topic of p.topics || []) {
        const entry = topics.get(topic) || { solved: 0, total: 0 };
        entry.total += 1; if (p.solved) entry.solved += 1;
        topics.set(topic, entry);
      }
    }
    const sorted = [...topics].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0])).slice(0, TOPIC_LIMIT);
    return { byDifficulty: difficulty, byTopic: sorted };
  }, [problems]);

  const body = (rows, empty) => {
    if (error) return <ErrorState message={error} onRetry={onRetry} />;
    if (loading) return <div role="status" aria-label="Loading progress" className="space-y-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div>;
    if (!rows.length) return <p className="text-base text-fg-muted">{empty}</p>;
    return <ul className="space-y-4">{rows}</ul>;
  };

  return (
    <>
      <Panel aria-label="Progress by difficulty">
        <PanelHeader title="By difficulty" />
        <PanelBody>
          {body(problems.length ? DIFFICULTIES.map(([key, label]) => <Row key={key} label={label} {...byDifficulty[key]} />) : [], 'Progress shows here once problems are available.')}
        </PanelBody>
      </Panel>
      <Panel aria-label="Progress by topic">
        <PanelHeader title="By topic" />
        <PanelBody>
          {body(byTopic.map(([topic, counts]) => <Row key={topic} label={topic} {...counts} />), 'Topics show here once problems are tagged.')}
        </PanelBody>
      </Panel>
    </>
  );
}
