import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { Spinner } from './Spinner.jsx';

const base =
  'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const variants = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-subtle',
  ghost: 'text-fg-muted hover:bg-subtle hover:text-fg',
  danger: 'border border-danger-border bg-danger-bg text-danger hover:border-danger',
};

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-base',
};

const iconSizes = { sm: 'size-8', md: 'size-9', lg: 'size-10' };

/**
 * Renders a <button>, a router <Link> when `to` is given, or an <a> when `href` is given.
 * `loading` shows a spinner and disables the button without changing its width.
 * `iconOnly` buttons must pass an `aria-label`.
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', loading = false, iconOnly = false, to, href, className, children, disabled, type = 'button', ...props },
  ref
) {
  const classes = cn(base, variants[variant], iconOnly ? iconSizes[size] : sizes[size], iconOnly && 'px-0', className);
  if (to) {
    return <Link ref={ref} to={to} className={classes} {...props}>{children}</Link>;
  }
  if (href) {
    return <a ref={ref} href={href} className={classes} {...props}>{children}</a>;
  }
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      <span className={cn('inline-flex items-center justify-center gap-2', loading && 'opacity-0')}>{children}</span>
      {loading && <span className="absolute inset-0 flex items-center justify-center"><Spinner /></span>}
    </button>
  );
});
