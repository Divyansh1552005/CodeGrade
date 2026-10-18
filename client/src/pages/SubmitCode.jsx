import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Code2, Copy, FileSearch, MessagesSquare, RotateCcw, Send, Terminal } from 'lucide-react';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';
import { usePagedList } from '../api/usePagedList.js';
import CodeEditor from '../components/CodeEditor.jsx';
import ProblemStatement from '../components/ProblemStatement.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import SubmissionResult from '../components/workspace/SubmissionResult.jsx';
import SubmissionHistory from '../components/workspace/SubmissionHistory.jsx';
import HintChat from '../components/workspace/HintChat.jsx';
import {
  Button, CodeBlock, DifficultyBadge, EmptyState, ErrorState, Field, Icon, ResizableGroup, ResizeHandle, ResizablePanel, Select,
  Skeleton, Tabs, TabsContent, TabsList, TabsTrigger,
} from '../components/ui/index.js';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { LANGUAGE_LABELS } from '../data/starterTemplates.js';

// A row is still moving through grading or AI feedback.
const hasPendingRow = (rows) => rows.some((r) => ['queued', 'running'].includes(r.status) || ['pending', 'running'].includes(r.feedbackStatus));

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
  const [openSubmissionId, setOpenSubmissionId] = useState(null);
  const [pane, setPane] = useState('description');
  const [consolePane, setConsolePane] = useState('results');
  const [mobileTab, setMobileTab] = useState('description');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
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
    { enabled: Boolean(polling), refetchInterval: polling ? 2000 : 0, pauseWhenHidden: true }
  );
  // This problem's submissions, ten at a time, newest first. Only the first page is refreshed, and only
  // while one of its rows is still being graded; an older page is never polled, so it never shifts.
  const submissionList = usePagedList({
    url: `/submissions?problemId=${problemId}`, itemsKey: 'submissions', syncUrl: false, enabled: Boolean(problemId),
    pollMs: 2000, pollWhen: hasPendingRow,
  });
  const listRef = useRef(submissionList);
  listRef.current = submissionList;

  useEffect(() => {
    const updated = statusData?.submission;
    if (!updated || updated._id !== result?._id) return;
    setResult(updated);
    if (['graded', 'error'].includes(updated.status)) {
      invalidate();
      if (listRef.current.isFirstPage) listRef.current.reload(); // a finished grade changes a row on the first page
    }
  }, [statusData, result?._id, problemId]);

  const starterFor = (problem, lang) => problem?.starterCode?.[lang] || '';

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
    setOpenSubmissionId(null);
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
      setConsolePane('results');
      setMobileTab('results');
      toast.success('Submission queued.', { id: 'submission-queued' });
      listRef.current.goNewest(); // show the new submission at the top of the history
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

  const title = locked && selected ? selected.title : 'Submit code';
  useEffect(() => { document.title = `${title} - CodeGrade`; }, [title]);
  const showWorkspace = !notFound && (locked || problems.length > 0);
  const samples = selected?.sampleCases ?? [];

  const descriptionPane = (
    <div className="space-y-4 p-4">
      {!locked && (
        <Field label="Problem">
          <Select value={problemId} disabled={busy || pending} onChange={(e) => onSelectProblem(e.target.value)}>
            {problems.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
          </Select>
        </Field>
      )}
      {selected && <ProblemStatement problem={selected} />}
    </div>
  );

  const historyPane = <div className="p-4"><SubmissionHistory list={submissionList} openId={openSubmissionId} onOpenChange={setOpenSubmissionId} /></div>;
  // Kept mounted when its tab is hidden so a draft message and the cooldown survive switching tabs.
  const hintsPane = problemId ? <HintChat key={problemId} problemId={problemId} code={code} /> : null;

  const editorPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="w-36">
          <Select aria-label="Language" className="h-8 text-sm" value={language} disabled={busy || pending} onChange={(e) => onSelectLanguage(e.target.value)}>
            {LANGUAGES.map((lang) => <option key={lang} value={lang}>{LANGUAGE_LABELS[lang]}</option>)}
          </Select>
        </div>
        <Button variant="ghost" size="sm" aria-label="Copy" onClick={copyCode} disabled={!code}><Icon as={Copy} /><span className="hidden sm:inline">Copy</span></Button>
        <Button variant="ghost" size="sm" aria-label="Reset" onClick={() => setResetOpen(true)} disabled={busy || pending}><Icon as={RotateCcw} /><span className="hidden sm:inline">Reset</span></Button>
        <span className="ml-auto hidden text-sm text-fg-muted 2xl:inline">Ctrl+Enter to submit</span>
        <Button type="submit" variant="primary" size="sm" className="ml-auto 2xl:ml-0" loading={busy || pending} disabled={!problemId}><Icon as={Send} />Submit solution</Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <CodeEditor language={language} value={code} onChange={updateCode} onSubmit={onSubmit} />
      </div>
    </div>
  );

  const testcasesPane = samples.length ? (
    <div className="space-y-4">
      {samples.map((sample, index) => (
        <div key={index}>
          <h3 className="mb-2 text-base font-medium">Example {index + 1}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <CodeBlock label="Input">{sample.input}</CodeBlock>
            <CodeBlock label="Expected output">{sample.output}</CodeBlock>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-base text-fg-muted">No public examples are available for this problem. Submit to run the test suite.</p>
  );

  const resultsPane = (
    <>
      {polling && statusError && <p role="status" className="mb-3 text-sm text-warning">Unable to refresh grading status. Retrying automatically…</p>}
      {result ? <SubmissionResult submission={result} /> : (
        <EmptyState icon={Terminal} title="No results yet" description="Submit your solution to run the test suite and get feedback. Limits are 2 submissions per minute and 20 per day." />
      )}
    </>
  );

  const consolePanel = (
    <Tabs value={consolePane} onValueChange={setConsolePane} className="flex h-full min-h-0 flex-col" aria-label="Execution console">
      <TabsList className="shrink-0">
        <TabsTrigger value="testcases">Testcases</TabsTrigger>
        <TabsTrigger value="results">Results</TabsTrigger>
      </TabsList>
      <TabsContent value="testcases" className="min-h-0 flex-1 overflow-auto p-4">{testcasesPane}</TabsContent>
      <TabsContent value="results" className="min-h-0 flex-1 overflow-auto p-4">{resultsPane}</TabsContent>
    </Tabs>
  );

  const surface = 'h-full min-w-0 overflow-hidden rounded-lg border border-border bg-surface';

  const desktop = (
    <ResizableGroup id="workspace-main" orientation="horizontal" panelIds={['statement', 'work']} className="absolute inset-0">
      <ResizablePanel id="statement" defaultSize="42%" minSize="25%">
        <Tabs value={pane} onValueChange={setPane} className={`${surface} flex flex-col`}>
          <TabsList className="shrink-0">
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="submissions">Submissions{typeof submissionList.meta.total === 'number' ? ` (${submissionList.meta.total})` : ''}</TabsTrigger>
            <TabsTrigger value="hints">Hints</TabsTrigger>
          </TabsList>
          <TabsContent value="description" className="min-h-0 flex-1 overflow-y-auto">{descriptionPane}</TabsContent>
          <TabsContent value="submissions" className="min-h-0 flex-1 overflow-y-auto">{historyPane}</TabsContent>
          <TabsContent value="hints" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">{hintsPane}</TabsContent>
        </Tabs>
      </ResizablePanel>
      <ResizeHandle orientation="horizontal" />
      <ResizablePanel id="work" minSize="35%">
        <ResizableGroup id="workspace-work" orientation="vertical" panelIds={['editor', 'console']} className="h-full">
          <ResizablePanel id="editor" defaultSize="62%" minSize="25%">
            <section aria-label="Solution editor" className={surface}>{editorPane}</section>
          </ResizablePanel>
          <ResizeHandle orientation="vertical" />
          <ResizablePanel id="console" defaultSize="38%" minSize="15%">
            <section aria-label="Execution console" className={surface}>{consolePanel}</section>
          </ResizablePanel>
        </ResizableGroup>
      </ResizablePanel>
    </ResizableGroup>
  );

  // Below lg the panes become tabs. The editor stays mounted so Monaco keeps its state.
  const mobile = (
    <Tabs value={mobileTab} onValueChange={setMobileTab} className={`${surface} absolute inset-0 flex flex-col`}>
      <TabsList className="shrink-0">
        <TabsTrigger value="description">Description</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
        <TabsTrigger value="results">Results</TabsTrigger>
        <TabsTrigger value="submissions">Submissions</TabsTrigger>
        <TabsTrigger value="hints">Hints</TabsTrigger>
      </TabsList>
      <TabsContent value="description" className="min-h-0 flex-1 overflow-y-auto">{descriptionPane}</TabsContent>
      <TabsContent value="code" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">{editorPane}</TabsContent>
      <TabsContent value="results" className="min-h-0 flex-1">{consolePanel}</TabsContent>
      <TabsContent value="submissions" className="min-h-0 flex-1 overflow-y-auto">{historyPane}</TabsContent>
      <TabsContent value="hints" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">{hintsPane}</TabsContent>
    </Tabs>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex min-w-0 shrink-0 items-center gap-2">
        <Button to={locked ? '/problems' : '/dashboard'} variant="ghost" size="sm" iconOnly aria-label={locked ? 'Back to problems' : 'Back to dashboard'}><Icon as={ArrowLeft} /></Button>
        <h1 className="min-w-0 truncate text-md font-semibold" title={title}>{title}</h1>
        {selected && <DifficultyBadge level={selected.difficulty || 'easy'} />}
        {locked && selected && <Button to={`/doubts/new?problem=${problemId}`} size="sm" className="ml-auto" aria-label="Ask a doubt"><Icon as={MessagesSquare} /><span className="hidden sm:inline">Ask a doubt</span><span className="sm:hidden">Doubt</span></Button>}
      </header>
      {loading && <div role="status" aria-label="Loading problems" className="space-y-3"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-64 w-full" /></div>}
      {(error || loadError) && <ErrorState message={error || loadError} />}
      {notFound && (
        <EmptyState icon={FileSearch} title="Problem not found" description="This problem may no longer be available. Choose another problem from the list." action={<Button variant="primary" to="/problems">Browse problems</Button>} />
      )}
      {!locked && !loading && problems.length === 0 && (
        <EmptyState icon={Code2} title="No problems yet" description="Problems appear here once a teacher adds one." />
      )}
      {showWorkspace && (
        <form className="relative min-h-0 flex-1" onSubmit={onSubmit}>
          {isDesktop ? desktop : mobile}
        </form>
      )}
      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={() => { updateCode(starterFor(selected, language)); setResetOpen(false); toast.success('Starter code restored.'); }} title="Reset your solution?" message="This replaces your current draft in this language with the starter code." confirmLabel="Reset code" />
    </div>
  );
}
