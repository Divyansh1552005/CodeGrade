import { useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useTheme } from '../theme/ThemeContext.jsx';
import { cn } from '../lib/cn.js';
import { Skeleton } from './ui/index.js';

// Map our language keys to Monaco language ids.
const MONACO_LANG = {
  javascript: 'javascript',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
};

const THEME_NAME = 'codegrade';

// Reads a design token (always a 6-digit hex) so the editor follows the same variables as the rest of the UI.
function token(name, alpha = '') {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() + alpha;
}

function defineTheme(monaco, dark) {
  monaco.editor.defineTheme(THEME_NAME, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': token('surface'),
      'editor.foreground': token('fg'),
      'editorLineNumber.foreground': token('fg-subtle'),
      'editorLineNumber.activeForeground': token('fg-muted'),
      'editor.lineHighlightBackground': token('subtle'),
      'editor.lineHighlightBorder': token('subtle'),
      'editor.selectionBackground': token('accent', '40'),
      'editor.inactiveSelectionBackground': token('accent', '24'),
      'editorCursor.foreground': token('accent'),
      'editorIndentGuide.background1': token('border'),
      'editorIndentGuide.activeBackground1': token('border-strong'),
      'editorWidget.background': token('raised'),
      'editorWidget.border': token('border'),
      'editorSuggestWidget.background': token('raised'),
      'editorSuggestWidget.border': token('border'),
      'editorSuggestWidget.selectedBackground': token('subtle'),
      'scrollbarSlider.background': token('border-strong', '66'),
      'scrollbarSlider.hoverBackground': token('border-strong', '99'),
      'scrollbarSlider.activeBackground': token('border-strong'),
    },
  });
  monaco.editor.setTheme(THEME_NAME);
}

/**
 * Monaco-based code editor. Wire `value`/`onChange` to a code string; set
 * `language` to one of our language keys to drive syntax highlighting.
 *
 * Without `height` it fills its (relatively positioned) parent. With `height`
 * it renders at that fixed height inside a bordered box.
 */
export default function CodeEditor({
  language,
  value,
  onChange,
  height,
  readOnly = false,
  onSubmit,
}) {
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const { theme } = useTheme();
  const monaco = useMonaco();
  const fill = !height;

  useEffect(() => {
    if (monaco) defineTheme(monaco, theme === 'dark');
  }, [monaco, theme]);

  return (
    <div className={cn('overflow-hidden', fill ? 'absolute inset-0' : 'rounded-sm border border-border')}>
      <Editor
        onMount={(editor, mountedMonaco) => {
          defineTheme(mountedMonaco, theme === 'dark');
          if (onSubmit) editor.addCommand(mountedMonaco.KeyMod.CtrlCmd | mountedMonaco.KeyCode.Enter, () => submitRef.current?.());
        }}
        height={fill ? '100%' : height}
        language={MONACO_LANG[language] || 'plaintext'}
        theme={THEME_NAME}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        loading={<div className="p-4"><Skeleton className="h-4 w-1/2" /></div>}
        options={{
          automaticLayout: true, // relayout when the pane is resized
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Consolas, monospace",
          padding: { top: 12, bottom: 12 },
          accessibilitySupport: 'on',
          ariaLabel: 'Solution code editor',
          tabSize: 4,
          scrollBeyondLastLine: false,
          readOnly,
          lineNumbers: 'on',
          wordWrap: 'on',
          renderLineHighlight: 'line',
          overviewRulerLanes: 0,
        }}
      />
    </div>
  );
}
