import { useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from '../theme/ThemeContext.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

// Map our language keys to Monaco language ids.
const MONACO_LANG = {
  javascript: 'javascript',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
};

/**
 * Monaco-based code editor. Wire `value`/`onChange` to a code string; set
 * `language` to one of our language keys to drive syntax highlighting. The
 * parent gives it a fixed height, which Monaco requires to lay out correctly.
 *
 * Monaco defaults we rely on (not disabled): line numbers, auto-closing
 * brackets, and auto-indentation on Enter/Tab. `automaticLayout` keeps it
 * responsive when the container resizes.
 */
export default function CodeEditor({
  language,
  value,
  onChange,
  height = '400px',
  readOnly = false,
  onSubmit,
}) {
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const { theme } = useTheme();
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <Editor
        onMount={(editor, monaco) => { if (onSubmit) editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => submitRef.current?.()); }}
        height={height}
        language={MONACO_LANG[language] || 'plaintext'}
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        loading={<LoadingSpinner label="Loading editor…" />}
        options={{
          automaticLayout: true, // responsive: relayout on container resize
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, monospace',
          padding: { top: 16, bottom: 16 },
          accessibilitySupport: 'on',
          ariaLabel: 'Solution code editor',
          tabSize: 4,
          scrollBeyondLastLine: false,
          readOnly,
          lineNumbers: 'on',
          wordWrap: 'on',
        }}
      />
    </div>
  );
}
