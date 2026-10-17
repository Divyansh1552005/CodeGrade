import { cn } from '../../lib/cn.js';

export function Skeleton({ className, ...props }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-sm bg-subtle', className)} {...props} />;
}

/** Placeholder rows that match the Table row height, so nothing shifts when data arrives. */
export function TableSkeleton({ rows = 6, columns = 4 }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-border rounded-lg border border-border bg-surface">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-11 items-center gap-6 px-4">
          {Array.from({ length: columns }, (_, col) => <Skeleton key={col} className={cn('h-3', col === 0 ? 'w-1/3' : 'w-1/6')} />)}
        </div>
      ))}
    </div>
  );
}
