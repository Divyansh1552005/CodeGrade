import { cn } from '../../lib/cn.js';

const sizes = { sm: 'size-6 text-xs', md: 'size-8 text-sm', lg: 'size-12 text-md' };

export function Avatar({ name = '', size = 'md', className }) {
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-subtle font-medium text-fg-muted', sizes[size], className)}>
      {name.trim()[0]?.toUpperCase() || '?'}
    </span>
  );
}
