import { cn } from '../../lib/cn.js';

// Flat surface with a 1px border. Panels are never nested inside panels.
export function Panel({ className, ...props }) {
  return <section className={cn('min-w-0 rounded-lg border border-border bg-surface', className)} {...props} />;
}

export function PanelHeader({ title, action, className, children }) {
  return (
    <div className={cn('flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2', className)}>
      {title ? <h2 className="min-w-0 truncate text-md font-semibold">{title}</h2> : children}
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function PanelBody({ className, ...props }) {
  return <div className={cn('p-4', className)} {...props} />;
}
