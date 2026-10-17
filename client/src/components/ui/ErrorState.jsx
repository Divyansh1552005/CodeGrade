import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';

export function ErrorState({ message, onRetry, className }) {
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-lg border border-danger-border bg-danger-bg p-4 text-base text-danger', className)}>
      <Icon as={AlertCircle} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p>{message}</p>
        {onRetry && <Button size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
      </div>
    </div>
  );
}
