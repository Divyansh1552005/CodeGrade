import Markdown from './Markdown.jsx';
import { Badge, CodeBlock } from './ui/index.js';

const FIRST_SOLVE_XP = { easy: 100, medium: 200, hard: 300 };

/**
 * The student-facing problem statement: description, input/output format,
 * constraints and the teacher's worked examples.
 *
 * Sections are rendered only when the problem has them, so problems authored
 * before these fields became mandatory still display cleanly.
 */
export default function ProblemStatement({ problem }) {
  if (!problem) return null;
  const difficulty = problem.difficulty || 'easy';
  const samples = problem.sampleCases?.filter((s) => s?.input || s?.output) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {problem.topics?.map((topic) => <Badge key={topic}>{topic}</Badge>)}
        <span className="text-sm text-fg-muted">{FIRST_SOLVE_XP[difficulty]} XP for your first solve</span>
      </div>

      {problem.description && <Markdown>{problem.description}</Markdown>}

      {problem.inputFormat && (
        <Section title="Input format"><Markdown>{problem.inputFormat}</Markdown></Section>
      )}

      {problem.outputFormat && (
        <Section title="Output format"><Markdown>{problem.outputFormat}</Markdown></Section>
      )}

      {problem.constraints && (
        <Section title="Constraints">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-sm border border-border bg-subtle p-3 text-sm">{problem.constraints}</pre>
        </Section>
      )}

      {samples.map((s, i) => (
        <Section key={i} title={samples.length > 1 ? `Example ${i + 1}` : 'Example'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <CodeBlock label="Input">{s.input}</CodeBlock>
            <CodeBlock label="Output">{s.output}</CodeBlock>
          </div>
          {s.explanation && (
            <div className="mt-3">
              <p className="mb-1 text-sm font-medium">Explanation</p>
              <Markdown>{s.explanation}</Markdown>
            </div>
          )}
        </Section>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
