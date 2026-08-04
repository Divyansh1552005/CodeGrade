import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';

// Register only the languages we expect — avoids bundling every Prism grammar
// (which balloons the chunk to ~800 kB).
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('sql', sql);

/**
 * Safe markdown renderer: GitHub-flavored markdown + code-block syntax
 * highlighting. Deliberately NO rehype-raw / no raw HTML — react-markdown
 * escapes HTML by default, so user-authored doubt/answer text can't inject
 * markup or scripts.
 */
export default function Markdown({ children }) {
  return (
    <div className="markdown text-sm text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children: codeChildren, ...rest }) {
            const match = /language-(\w+)/.exec(className || '');
            // Fenced block with a language -> highlight; otherwise inline/plain.
            return match ? (
              <SyntaxHighlighter
                {...rest}
                PreTag="div"
                language={match[1]}
                style={oneLight}
                customStyle={{ borderRadius: '0.5rem', fontSize: '0.85em', margin: '0.5rem 0' }}
              >
                {String(codeChildren).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code {...rest} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">
                {codeChildren}
              </code>
            );
          },
          // Links open safely in a new tab.
          a({ children: linkChildren, ...props }) {
            return (
              <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                {linkChildren}
              </a>
            );
          },
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
