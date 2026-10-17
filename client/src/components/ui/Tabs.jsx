import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '../../lib/cn.js';

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }) {
  return <RadixTabs.List className={cn('flex items-center gap-1 overflow-x-auto border-b border-border px-2', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }) {
  return (
    <RadixTabs.Trigger
      className={cn(
        '-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg',
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return <RadixTabs.Content className={cn('min-h-0 focus-visible:outline-offset-0', className)} {...props} />;
}
