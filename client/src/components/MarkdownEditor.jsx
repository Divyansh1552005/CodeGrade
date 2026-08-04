import { useEffect, useRef, useState } from 'react';
import Markdown from './Markdown.jsx';

const tabBase = 'rounded-md px-3 py-1 text-xs font-medium transition';
const tabActive = `${tabBase} bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900`;
const tabIdle = `${tabBase} text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800`;

/**
 * A textarea with a Write/Preview toggle. "Write" is a plain textarea for
 * authoring markdown; "Preview" renders it via the safe Markdown component.
 *
 * When `autoGrow` is set, the textarea grows to fit its content (no inner
 * scrollbar) so long text spreads down the page instead of scrolling in a box.
 */
export default function MarkdownEditor({
  value,
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

  const writeClass = autoGrow
    ? `input w-full ${minH} resize-none overflow-hidden font-mono text-sm`
    : `input w-full ${minH} font-mono text-sm`;

  return (
    <div>
      <div className="mb-2 flex gap-1">
        <button type="button" className={tab === 'write' ? tabActive : tabIdle} onClick={() => setTab('write')}>
          Write
        </button>
        <button type="button" className={tab === 'preview' ? tabActive : tabIdle} onClick={() => setTab('preview')}>
          Preview
        </button>
      </div>

      {tab === 'write' ? (
        <textarea
          ref={ref}
          className={writeClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={autoGrow ? 1 : rows}
          placeholder={placeholder}
          spellCheck={false}
        />
      ) : (
        <div className={`input ${minH} bg-white dark:bg-slate-800 ${autoGrow ? '' : 'overflow-auto'}`}>
          {value?.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  );
}
