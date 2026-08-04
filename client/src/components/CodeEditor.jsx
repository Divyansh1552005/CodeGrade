import Editor from '@monaco-editor/react';

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
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-300">
      <Editor
        height={height}
        language={MONACO_LANG[language] || 'plaintext'}
        theme="light"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        loading={<div className="p-4 text-sm text-slate-400">Loading editor…</div>}
        options={{
          automaticLayout: true, // responsive: relayout on container resize
          minimap: { enabled: false },
          fontSize: 13,
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
