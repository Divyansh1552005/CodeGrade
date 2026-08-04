import { memo, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';
import Markdown from '../components/Markdown.jsx';
import CodeEditor from '../components/CodeEditor.jsx';
import ProblemStatement from '../components/ProblemStatement.jsx';
import { LANGUAGE_LABELS } from '../data/starterTemplates.js';

// Student-selectable languages, in the order shown in the dropdown.
const LANGUAGES = ['javascript', 'python', 'java', 'cpp'];

export default function SubmitCode() {
  // When opened via /submit/:problemId, the page is locked to that one problem.
  const { problemId: routeProblemId } = useParams();
  const locked = Boolean(routeProblemId);

  const { data, loading, error: loadError } = useCachedQuery('/problems');
  const problems = useMemo(() => data?.problems ?? [], [data]);

  const [problemId, setProblemId] = useState(routeProblemId || '');
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [submissions, setSubmissions] = useState([]);

  const starterFor = (problem, lang) => problem?.starterCode?.[lang] || '';

  // Load this student's past submissions for the selected problem.
  async function loadSubmissions(pid) {
    if (!pid) return;
    try {
      const res = await api.get(`/submissions?problemId=${pid}`);
      setSubmissions(res.data.submissions);
    } catch {
      /* non-critical */
    }
  }

  useEffect(() => {
    if (problemId) loadSubmissions(problemId);
    else setSubmissions([]);
  }, [problemId]);

  // Locked: sync to the route problem. Generic: default to the first problem.
  useEffect(() => {
    if (locked) {
      const p = problems.find((x) => x._id === routeProblemId);
      if (p && problemId !== routeProblemId) {
        setProblemId(routeProblemId);
        setCode(starterFor(p, language));
      }
    } else if (!problemId && problems[0]) {
      setProblemId(problems[0]._id);
      setCode(starterFor(problems[0], language));
    }
  }, [locked, routeProblemId, problems, problemId, language]);

  const selected = useMemo(
    () => problems.find((p) => p._id === problemId),
    [problems, problemId]
  );

  // Locked to a problem id that doesn't exist (bad link / archived).
  const notFound = locked && !loading && problems.length > 0 && !selected;

  function onSelectProblem(id) {
    setProblemId(id);
    setResult(null);
    setCode(starterFor(problems.find((x) => x._id === id), language));
  }

  function onSelectLanguage(lang) {
    setLanguage(lang);
    // Auto-fill the editor with this language's starter code (or blank).
    setCode(starterFor(selected, lang));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!code.trim()) {
      setError('Code cannot be empty.');
      return;
    }
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const res = await api.post('/submissions', { problemId, code, language });
      setResult(res.data.submission);
      loadSubmissions(problemId); // refresh the history
      invalidate('/problems'); // so the "Solved" badge updates on the list
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {locked && (
        <div className="mb-3">
          <Link
            to="/problems"
            className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Back to problems
          </Link>
        </div>
      )}
      <h1 className="mb-4 text-xl font-semibold">
        {locked && selected ? selected.title : 'Submit Code'}
      </h1>
      {loading && <p className="text-slate-400 dark:text-slate-500">Loading problems…</p>}
      {(error || loadError) && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error || loadError}</p>
      )}
      {notFound && <p className="text-sm text-red-600 dark:text-red-400">Problem not found.</p>}

      {!locked && !loading && problems.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No problems are available to solve yet. Check back once a teacher adds one.
        </p>
      )}

      <form onSubmit={onSubmit} hidden={notFound || (!locked && problems.length === 0)}>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Locked mode hides the problem picker — the student is solving one problem. */}
          {!locked && (
            <label className="field">
              Problem
              <select
                className="input"
                value={problemId}
                onChange={(e) => onSelectProblem(e.target.value)}
              >
                {problems.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            Language
            <select
              className="input"
              value={language}
              onChange={(e) => onSelectLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selected && <ProblemStatement problem={selected} />}

        <div className="field">
          <span>
            Code <span className="pill">{LANGUAGE_LABELS[language]}</span>
          </span>
          <CodeEditor language={language} value={code} onChange={setCode} height="400px" />
        </div>

        <button className="btn" disabled={busy || !problemId}>
          {busy ? 'Running…' : 'Run & Grade'}
        </button>
      </form>

      {result && <Results submission={result} />}

      {submissions.length > 0 && <PastSubmissions submissions={submissions} />}
    </div>
  );
}

const PastSubmissions = memo(function PastSubmissions({ submissions }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
      <h2 className="mb-3 text-lg font-semibold">Your submissions</h2>
      <div className="space-y-2">
        {submissions.map((s) => {
          const solved = s.totalCount > 0 && s.passCount === s.totalCount;
          const open = openId === s._id;
          return (
            <div key={s._id} className="rounded-lg border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                onClick={() => setOpenId(open ? null : s._id)}
              >
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className={`badge ${
                      solved
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                    }`}
                  >
                    {s.passCount}/{s.totalCount}
                  </span>
                  <span className="pill">{LANGUAGE_LABELS[s.language] || s.language}</span>
                  <span className="text-slate-400 dark:text-slate-500">
                    {new Date(s.createdAt).toLocaleString()}
                  </span>
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {open ? 'Hide' : 'View'}
                </span>
              </button>
              {open && (
                <div className="border-t border-slate-100 px-3 pb-3 dark:border-slate-800">
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Submitted code
                    </p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                      {s.code}
                    </pre>
                  </div>
                  <Results submission={s} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

const Results = memo(function Results({ submission }) {
  const { passCount, totalCount, testResults, aiFeedback, status } = submission;
  const allPass = passCount === totalCount;
  return (
    <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        Results
        <span
          className={`badge ${
            allPass
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
          }`}
        >
          {passCount}/{totalCount} passed
        </span>
        <span className="badge">{status}</span>
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500 dark:text-slate-400">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Input</th>
              <th className="p-2">Expected</th>
              <th className="p-2">Actual</th>
              <th className="p-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {testResults.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                <td className="p-2">{i + 1}</td>
                <td className="p-2"><pre className="whitespace-pre-wrap">{r.input}</pre></td>
                <td className="p-2"><pre className="whitespace-pre-wrap">{r.expectedOutput}</pre></td>
                <td className="p-2"><pre className="whitespace-pre-wrap">{r.actualOutput}</pre></td>
                <td className="p-2">{r.passed ? '✅' : '❌'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aiFeedback ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">AI Feedback</h3>
          </div>

          <div className="space-y-4 p-4">
            {/* Summary */}
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <Markdown>{aiFeedback.summary}</Markdown>
            </div>

            {/* Strengths + improvements */}
            <div className="grid gap-3 sm:grid-cols-2">
              <FeedbackList
                title="Strengths"
                items={aiFeedback.strengths}
                tone="green"
                empty="No specific strengths noted."
              />
              <FeedbackList
                title="Improvements"
                items={aiFeedback.improvements}
                tone="amber"
                empty="No improvements suggested."
              />
            </div>

            {/* Complexity */}
            {aiFeedback.complexityNote && (
              <div className="flex flex-wrap items-baseline gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                <span className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400">
                  Complexity
                </span>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <Markdown>{aiFeedback.complexityNote}</Markdown>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
          AI feedback was not available for this submission.
        </p>
      )}
    </div>
  );
});

const TONES = {
  green: 'border-green-200 bg-green-50 dark:border-green-900/60 dark:bg-green-950/30',
  amber: 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30',
};

function FeedbackList({ title, items, tone, empty }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div
      className={`rounded-lg border p-3 ${
        TONES[tone] || 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800'
      }`}
    >
      <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h4>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="mt-1 text-slate-400 dark:text-slate-500">•</span>
              <div className="min-w-0 flex-1">
                <Markdown>{s}</Markdown>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
