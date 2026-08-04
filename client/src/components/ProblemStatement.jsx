import Markdown from './Markdown.jsx';

/**
 * The student-facing problem statement: description, input/output format,
 * constraints and the teacher's worked examples.
 *
 * Sections are rendered only when the problem has them, so problems authored
 * before these fields became mandatory still display cleanly.
 */
export default function ProblemStatement({ problem }) {
  if (!problem) return null;
  const samples = problem.sampleCases?.filter((s) => s?.input || s?.output) ?? [];

  return (
    <div className="mb-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
      {problem.description && (
        <Section title="Problem">
          <Markdown>{problem.description}</Markdown>
        </Section>
      )}

      {problem.inputFormat && (
        <Section title="Input format">
          <Markdown>{problem.inputFormat}</Markdown>
        </Section>
      )}

      {problem.outputFormat && (
        <Section title="Output format">
          <Markdown>{problem.outputFormat}</Markdown>
        </Section>
      )}

      {problem.constraints && (
        <Section title="Constraints">
          <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 font-mono text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {problem.constraints}
          </pre>
        </Section>
      )}

      {samples.length > 0 && (
        <Section title={samples.length > 1 ? 'Sample examples' : 'Sample example'}>
          <div className="space-y-3">
            {samples.map((s, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                {samples.length > 1 && (
                  <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Example {i + 1}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <SampleBlock label="Input" value={s.input} />
                  <SampleBlock label="Output" value={s.output} />
                </div>
                {s.explanation && (
                  <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Explanation:{' '}
                    </span>
                    <Markdown>{s.explanation}</Markdown>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <div className="text-sm text-slate-700 dark:text-slate-300">{children}</div>
    </div>
  );
}

function SampleBlock({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">
        {value}
      </pre>
    </div>
  );
}
