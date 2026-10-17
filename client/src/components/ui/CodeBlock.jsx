import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';

/** Monospace block on a recessed surface. Scrolls horizontally instead of wrapping. */
const tones = {
  neutral: 'border-border bg-subtle',
  success: 'border-success-border bg-success-bg',
  danger: 'border-danger-border bg-danger-bg',
};

export function CodeBlock({ children, label, tone = 'neutral', className }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(children ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-sm border', tones[tone], className)}>
      <div className="flex h-8 items-center justify-between border-b border-inherit pl-3 pr-1">
        <span className="text-xs text-fg-muted">{label}</span>
        <Button variant="ghost" size="sm" iconOnly aria-label={copied ? 'Copied' : 'Copy to clipboard'} onClick={copy} className="size-6">
          <Icon as={copied ? Check : Copy} />
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto p-3 text-sm leading-5 text-fg"><code>{children === '' || children == null ? '(empty)' : children}</code></pre>
    </div>
  );
}
