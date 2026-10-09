import { PageHeader, EmptyState, ErrorState } from '../components/UI.jsx';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';
import Markdown from '../components/Markdown.jsx';
import CodeEditor from '../components/CodeEditor.jsx';
import ProblemStatement from '../components/ProblemStatement.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { Spinner } from '../components/FormMotion.jsx';
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
  const [pane, setPane] = useState('Description');
  const [consolePane, setConsolePane] = useState('Results');
  const [resetOpen, setResetOpen] = useState(false);
  const drafts = useRef(new Map());
  const activeProblem = useRef(problemId);
  activeProblem.current = problemId;
  const initialized = useRef('');

  const pending = result && ['queued', 'running'].includes(result.status);
  const pendingFeedback = result?.status === 'graded' && ['pending', 'running'].includes(result.feedbackStatus);
  const polling = pending || pendingFeedback;
  const { data: statusData, error: statusError } = useCachedQuery(
    result ? `/submissions/${result._id}` : '',
    { enabled: Boolean(polling), refetchInterval: polling ? 2000 : 0 }
  );

  useEffect(() => {
    const updated = statusData?.submission;
    if (!updated || updated._id !== result?._id) return;
    setResult(updated);
    if (['graded', 'error'].includes(updated.status)) {
      invalidate();
      loadSubmissions(problemId);
    }
  }, [statusData, result?._id, problemId]);

  const starterFor = (problem, lang) => problem?.starterCode?.[lang] || '';

  // Load this student's past submissions for the selected problem.
  async function loadSubmissions(pid) {
    if (!pid) return;
    try {
      const res = await api.get(`/submissions?problemId=${pid}`);
      if (activeProblem.current === pid) setSubmissions(res.data.submissions);
    } catch {
      /* non-critical */
    }
  }

  useEffect(() => {
    if (problemId) loadSubmissions(problemId);
    else setSubmissions([]);
  }, [problemId]);

  // Resume status refresh for pending history entries after revisiting the page.
  const hasPendingHistory = submissions.some((s) => ['queued', 'running'].includes(s.status) || ['pending', 'running'].includes(s.feedbackStatus));
  useEffect(() => {
    if (!problemId || !hasPendingHistory) return;
    const timer = setInterval(() => loadSubmissions(problemId), 2000);
    return () => clearInterval(timer);
  }, [problemId, hasPendingHistory]);

  useEffect(() => {
    const id = locked ? routeProblemId : problemId || problems[0]?._id;
    const problem = problems.find((item) => item._id === id);
    if (!problem || initialized.current === id) return;
    initialized.current = id;
    setProblemId(id);
    setResult(null);
    setCode(drafts.current.get(`${id}:${language}`) ?? starterFor(problem, language));
  }, [locked, routeProblemId, problems, problemId, language]);

  const selected = useMemo(
    () => problems.find((p) => p._id === problemId),
    [problems, problemId]
  );

  // Locked to a problem id that doesn't exist (bad link / archived).
  const notFound = locked && !loading && !loadError && !selected;

  function updateCode(value) {
    drafts.current.set(`${problemId}:${language}`, value);
    setCode(value);
  }

  function onSelectProblem(id) {
    drafts.current.set(`${problemId}:${language}`, code);
    setProblemId(id);
    setSubmissions([]);
    setError('');
  }

  function onSelectLanguage(lang) {
    drafts.current.set(`${problemId}:${language}`, code);
    setLanguage(lang);
    setCode(drafts.current.get(`${problemId}:${lang}`) ?? starterFor(selected, lang));
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code copied to clipboard.');
    } catch {
      toast.error('Unable to copy. Select the code and copy it manually.');
    }
  }

  async function onSubmit(e) {
    e?.preventDefault();
    if (busy || pending || !problemId) return;
    if (!code.trim()) {
      const msg = 'Code cannot be empty.';
      setError(msg);
      toast.error(msg);
      return;
    }
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const res = await api.post('/submissions', { problemId, code, language });
      if (activeProblem.current !== problemId) return;
      setResult(res.data.submission);
      setConsolePane('Results');
      toast.success('Submission queued.', { id: 'submission-queued' });
      loadSubmissions(problemId); // refresh the history
      invalidate('/problems'); // so the "Solved" badge updates on the list
    } catch (err) {
      // Covers rate-limit responses (429, e.g. "You can submit once per
      // minute — try again in 43s.") the same way as any other failure.
      const msg = err.response?.data?.error || 'Submission failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Coding workspace" title={locked && selected ? selected.title : 'Submit code'} description="Read the challenge, build your solution, and learn from each test run." backTo={locked ? '/problems' : undefined} backLabel="Problem library" />
      {loading && <LoadingSpinner label="Loading problems…" />}
      {(error || loadError) && (
        <ErrorState message={error || loadError} />
      )}
      {notFound && <EmptyState icon="code" title="Problem not found" description="This problem may no longer be available. Choose another challenge from the library." action={<Link className="btn" to="/problems">Browse problems</Link>} />}

      {!locked && !loading && problems.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No problems are available to solve yet. Check back once a teacher adds one.
        </p>
      )}

      <form className="coding-workspace" onSubmit={onSubmit} hidden={notFound || (!locked && problems.length === 0)}>
        <section className="workspace-panel workspace-statement" aria-label="Problem workspace">
          <div className="workspace-toolbar">
            {['Description', 'Submissions'].map((item) => <button type="button" key={item} className="workspace-tab" aria-pressed={pane === item} onClick={() => setPane(item)}>{item}{item === 'Submissions' ? ` (${submissions.length})` : ''}</button>)}
          </div>
          <div className="workspace-scroll p-5">
            {!locked && <label className="field">Problem<select className="input" value={problemId} disabled={busy || pending} onChange={(e) => onSelectProblem(e.target.value)}>{problems.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}</select></label>}
            {pane === 'Description' ? selected && <ProblemStatement problem={selected} embedded /> : submissions.length ? <PastSubmissions submissions={submissions} /> : <EmptyState icon="clock" title="No submissions yet" description="Your submitted solutions and results will appear here." />}
          </div>
        </section>
        <div className="min-w-0 space-y-3">
          <section className="workspace-panel" aria-label="Solution editor">
            <div className="workspace-toolbar justify-between">
              <label className="flex items-center gap-2 text-xs font-medium">Language<select className="workspace-language" value={language} disabled={busy || pending} onChange={(e) => onSelectLanguage(e.target.value)}>{LANGUAGES.map((lang) => <option key={lang} value={lang}>{LANGUAGE_LABELS[lang]}</option>)}</select></label>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost btn-sm" onClick={copyCode} disabled={!code}>Copy</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setResetOpen(true)} disabled={busy || pending}>Reset</button>
              </div>
            </div>
            <CodeEditor language={language} value={code} onChange={updateCode} height="420px" onSubmit={onSubmit} />
            <div className="workspace-toolbar justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Ctrl / ⌘ + Enter to submit</span>
              <button className="btn flex items-center gap-2" disabled={busy || pending || !problemId}>{busy && <Spinner />}{busy ? 'Submitting…' : pending ? 'Grading…' : 'Submit solution'}</button>
            </div>
          </section>
          <section className="workspace-panel" aria-label="Execution console">
            <div className="workspace-toolbar">{['Testcases', 'Results'].map((item) => <button type="button" key={item} className="workspace-tab" aria-pressed={consolePane === item} onClick={() => setConsolePane(item)}>{item}</button>)}</div>
            <div className="workspace-console p-4">
              {polling && statusError && <p role="status" className="mb-3 text-sm text-amber-600">Unable to refresh grading status. Retrying automatically…</p>}
              {consolePane === 'Results' ? result ? <Results submission={result} /> : <EmptyState icon="code" title="Ready when you are" description="Submit your solution to run the test suite and receive feedback." /> : selected?.sampleCases?.length ? <div className="space-y-4">{selected.sampleCases.map((sample, index) => <div key={index}><h3 className="mb-2 text-sm font-semibold">Example {index + 1}</h3><div className="grid gap-3 sm:grid-cols-2"><ConsoleValue label="Input" value={sample.input} /><ConsoleValue label="Expected output" value={sample.output} /></div></div>)}</div> : <p className="text-sm text-slate-500">No public examples are available for this problem. Submit to run the test suite.</p>}
            </div>
          </section>
          <p className="px-1 text-xs text-slate-500 dark:text-slate-400">2 submissions per minute · 20 per day. Language drafts stay available while this workspace is open.</p>
        </div>
      </form>
      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={() => { updateCode(starterFor(selected, language)); setResetOpen(false); toast.success('Starter code restored.'); }} title="Reset your solution?" message="This replaces your current language draft with the problem’s starter code." confirmLabel="Reset code" />
    </div>
  );
}

const PastSubmissions = memo(function PastSubmissions({ submissions }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-lg font-semibold">Your submissions</h2>
      <div className="space-y-2">
        {submissions.map((s) => {
          const solved = s.totalCount > 0 && s.passCount === s.totalCount;
          const open = openId === s._id;
          return (
            <div key={s._id} className="rounded-lg border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setOpenId(open ? null : s._id)}
              >
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`badge ${
                      solved
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                    }`}
                  >
                    {s.status === 'graded' ? `${s.passCount}/${s.totalCount}` : s.status}
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
  if (status === 'queued' || status === 'running') {
    return <p role="status" className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-700 dark:border-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-300">{status === 'queued'
      ? 'Submission queued. Waiting for grading…' : 'Grading your submission…'}</p>;
  }
  if (status === 'error') {
    return <p role="alert" className="error-state">{submission.error || 'Grading failed. Please resubmit.'}</p>;
  }
  const allPass = totalCount > 0 && passCount === totalCount;
  return (
    <div className="space-y-4">
      <h2 className="mb-5 flex flex-wrap items-center gap-2 text-lg font-semibold">
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

      <div className="table-shell">
        <table className="data-table">
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
            {(testResults || []).map((r, i) => (
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
          {['pending', 'running'].includes(submission.feedbackStatus) ? 'AI feedback is being prepared. Your test results are ready.' : 'AI feedback was not available for this submission.'}
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

function ConsoleValue({ label, value }) { return <div><p className="mb-2 text-xs font-medium text-slate-500">{label}</p><pre className="rounded-lg bg-slate-100 p-3 text-sm whitespace-pre-wrap break-words dark:bg-slate-800">{value || "(empty)"}</pre></div>; }
