import * as RadixTooltip from '@radix-ui/react-tooltip';

export function Tooltip({ content, children, side = 'top' }) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content side={side} sideOffset={6} className="z-50 rounded-sm border border-border bg-raised px-2 py-1 text-xs text-fg shadow-raised">
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
