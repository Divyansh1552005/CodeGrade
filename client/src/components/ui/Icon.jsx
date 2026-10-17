import { cn } from '../../lib/cn.js';

// One size and one stroke width for every icon in the app.
export const ICON_SIZE = 16;
export const ICON_STROKE = 1.75;

export function Icon({ as: Glyph, className, ...props }) {
  return <Glyph size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" className={cn('shrink-0', className)} {...props} />;
}
