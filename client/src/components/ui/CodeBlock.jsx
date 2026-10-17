import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';

/** Monospace block on a recessed surface. Scrolls horizontally instead of wrapping. */
export function CodeBlock({ children, label, className }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(children));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-sm border border-border bg-subtle', className)}>
      <div className="flex h-8 items-center justify-between border-b border-border pl-3 pr-1">
        <span className="text-xs text-fg-muted">{label}</span>
        <Button variant="ghost" size="sm" iconOnly aria-label={copied ? 'Copied' : 'Copy to clipboard'} onClick={copy} className="size-6">
          <Icon as={copied ? Check : Copy} />
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto p-3 text-sm leading-5 text-fg"><code>{children}</code></pre>
    </div>
  );
}
