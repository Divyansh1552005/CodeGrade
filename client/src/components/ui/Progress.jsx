import { cn } from '../../lib/cn.js';

export function Progress({ value, label, className }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className={cn('h-1 overflow-hidden rounded-full bg-subtle', className)}>
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}
