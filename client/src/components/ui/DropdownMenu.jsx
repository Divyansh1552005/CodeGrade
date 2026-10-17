import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/cn.js';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...props }) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn('z-50 min-w-48 rounded-lg border border-border bg-raised p-1 shadow-raised', className)}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }) {
  return (
    <Menu.Item
      className={cn('flex h-8 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm text-fg outline-none data-[highlighted]:bg-subtle data-[disabled]:opacity-50', className)}
      {...props}
    />
  );
}

export const DropdownMenuLabel = ({ className, ...props }) => (
  <Menu.Label className={cn('px-2 py-1.5 text-xs text-fg-muted', className)} {...props} />
);
export const DropdownMenuSeparator = ({ className, ...props }) => (
  <Menu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
);
