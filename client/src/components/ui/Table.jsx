import { cn } from '../../lib/cn.js';

/** Horizontally scrollable wrapper. Pass `maxHeight` classes (e.g. "max-h-96") to get a sticky header. */
export function Table({ className, wrapperClassName, ...props }) {
  return (
    <div className={cn('overflow-auto rounded-lg border border-border bg-surface', wrapperClassName)}>
      <table className={cn('w-full min-w-max text-left text-base', className)} {...props} />
    </div>
  );
}

export const THead = (props) => <thead className="sticky top-0 z-10 bg-subtle" {...props} />;
export const TBody = (props) => <tbody className="divide-y divide-border" {...props} />;
export const Tr = ({ className, ...props }) => <tr className={cn('transition-colors hover:bg-subtle', className)} {...props} />;
export const Th = ({ className, numeric, ...props }) => (
  <th scope="col" className={cn('h-10 whitespace-nowrap border-b border-border px-3 text-xs sm:px-4 font-medium text-fg-muted', numeric && 'text-right', className)} {...props} />
);
export const Td = ({ className, numeric, ...props }) => (
  <td className={cn('h-11 px-3 align-middle sm:px-4', numeric && 'text-right tabular-nums', className)} {...props} />
);
