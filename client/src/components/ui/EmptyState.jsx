import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center rounded-lg border border-dashed border-border-strong px-6 py-10 text-center', className)}>
      {icon && <Icon as={icon} className="mb-3 text-fg-subtle" />}
      <h3 className="text-md font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
