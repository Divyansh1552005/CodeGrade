import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';

/** Accessible dialog: focus trap, Escape to close, focus returns to the trigger. */
export function Modal({ open, onOpenChange, title, description, footer, className, children }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Content
          className={cn('fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-4/5 max-w-lg -translate-y-1/2 flex-col rounded-lg border border-border bg-raised shadow-overlay', className)}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-md font-semibold">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-sm text-fg-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" iconOnly aria-label="Close"><Icon as={X} /></Button>
            </Dialog.Close>
          </div>
          {children && <div className="min-h-0 overflow-y-auto px-4 py-4">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
