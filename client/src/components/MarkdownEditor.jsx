import { useEffect, useRef, useState } from 'react';
import Markdown from './Markdown.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/index.js';
import { cn } from '../lib/cn.js';

/**
 * A textarea with Write and Preview tabs. "Write" is a plain textarea for
 * authoring markdown; "Preview" renders it via the safe Markdown component.
 *
 * When `autoGrow` is set, the textarea grows to fit its content (no inner
 * scrollbar) so long text spreads down the page instead of scrolling in a box.
 */
export default function MarkdownEditor({
  value,
  label = 'Markdown content',
  onChange,
  placeholder = '',
  rows = 6,
  minH = 'min-h-32',
  autoGrow = false,
}) {
  const [tab, setTab] = useState('write');
  const ref = useRef(null);

  // Resize the textarea to fit its content whenever the value (or tab) changes.
  useEffect(() => {
    if (!autoGrow || tab !== 'write' || !ref.current) return;
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, tab, autoGrow]);

  return (
    <Tabs value={tab} onValueChange={setTab} className="overflow-hidden rounded-sm border border-border-strong bg-surface focus-within:border-accent">
      <TabsList>
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
      <TabsContent value="write">
        <textarea
          ref={ref}
          aria-label={label}
          className={cn('block w-full border-0 bg-transparent p-3 font-mono text-sm leading-6 text-fg outline-none placeholder:text-fg-subtle', minH, autoGrow ? 'resize-none overflow-hidden' : 'resize-y')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={autoGrow ? 1 : rows}
          placeholder={placeholder}
          spellCheck={false}
        />
      </TabsContent>
      <TabsContent value="preview" className={cn('p-3', minH, !autoGrow && 'overflow-auto')}>
        {value?.trim() ? <Markdown>{value}</Markdown> : <p className="text-base text-fg-muted">Nothing to preview.</p>}
      </TabsContent>
    </Tabs>
  );
}
