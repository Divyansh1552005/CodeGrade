import { Children, cloneElement, useId, useState } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

const control =
  'w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-fg-subtle transition-colors hover:border-fg-subtle focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-60 aria-invalid:border-danger';

export function Input({ className, ...props }) {
  return <input className={cn(control, 'h-9', className)} {...props} />;
}

/** Password input with a show/hide toggle. Drop-in for <Input type="password">; Field wires id and aria props onto it. */
export function PasswordInput({ className, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input type={visible ? 'text' : 'password'} className={cn(control, 'h-9 pr-10', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-fg-muted transition-colors hover:text-fg"
      >
        <Icon as={visible ? EyeOff : Eye} />
      </button>
    </div>
  );
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(control, 'min-h-24 py-2 leading-6', className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select className={cn(control, 'h-9 appearance-none pr-9', className)} {...props}>{children}</select>
      <Icon as={ChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}

export function Checkbox({ label, className, ...props }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-base text-fg', className)}>
      <input type="checkbox" className="size-4 rounded-sm accent-accent" {...props} />
      {label}
    </label>
  );
}

/**
 * Label above the control, helper and error text below. Wires id, aria-describedby
 * and aria-invalid onto its single child (Input, Select, Textarea).
 */
export function Field({ label, hint, error, className, children }) {
  const id = useId();
  const noteId = `${id}-note`;
  const child = Children.only(children);
  const control = cloneElement(child, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? noteId : undefined,
  });
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
      {control}
      {error ? <p id={noteId} className="text-sm text-danger">{error}</p> : hint ? <p id={noteId} className="text-sm text-fg-muted">{hint}</p> : null}
    </div>
  );
}
