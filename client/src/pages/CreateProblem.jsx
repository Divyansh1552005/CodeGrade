import { PageHeader, ErrorState } from '../components/UI.jsx';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';
import { STARTER_TEMPLATES, LANGUAGE_LABELS } from '../data/starterTemplates.js';
import CodeEditor from '../components/CodeEditor.jsx';
import TopicSelect from '../components/TopicSelect.jsx';

const emptyCase = () => ({ input: '', expectedOutput: '' });
const emptySample = () => ({ input: '', output: '', explanation: '' });
const LANGUAGES = ['javascript', 'python', 'java', 'cpp'];
const emptyStarter = () => ({ javascript: '', python: '', java: '', cpp: '' });

const tabBase = 'min-h-10 rounded-lg px-3 py-2 text-xs font-medium transition';
const tabActive = `${tabBase} bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900`;
const tabIdle = `${tabBase} text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800`;

export default function CreateProblem() {
  const { id } = useParams(); // present => edit mode
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    difficulty: 'easy',
    description: '',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
  });
  // Public worked examples — at least one is required.
  const [sampleCases, setSampleCases] = useState([emptySample()]);
  // Fixed, LeetCode-style categorization — at least one is required.
  const [topics, setTopics] = useState([]);
  // starterCode is language-agnostic on the Problem: optional boilerplate per language.
  const [starterCode, setStarterCode] = useState(emptyStarter());
  const [activeLang, setActiveLang] = useState('javascript');
  const [testCases, setTestCases] = useState([emptyCase()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // In edit mode, load the existing problem.
  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/problems/${id}`)
      .then(({ data }) => {
        const p = data.problem;
        setForm({
          title: p.title || '',
          difficulty: p.difficulty || 'easy',
          description: p.description || '',
          inputFormat: p.inputFormat || '',
          outputFormat: p.outputFormat || '',
          constraints: p.constraints || '',
        });
        setStarterCode({ ...emptyStarter(), ...(p.starterCode || {}) });
        setTestCases(p.testCases?.length ? p.testCases : [emptyCase()]);
        setTopics(p.topics || []);
        setSampleCases(
          p.sampleCases?.length
            ? p.sampleCases.map((s) => ({ ...emptySample(), ...s }))
            : [emptySample()]
        );
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load problem'));
  }, [id, isEdit]);

  const setField = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function setLangCode(lang, value) {
    setStarterCode((s) => ({ ...s, [lang]: value }));
  }

  // Insert a boilerplate template into the active language field (create only).
  function insertTemplate() {
    setLangCode(activeLang, STARTER_TEMPLATES[activeLang] || '');
  }

  function updateSample(i, key, value) {
    setSampleCases((sc) => sc.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)));
  }
  function addSample() {
    setSampleCases((sc) => [...sc, emptySample()]);
  }
  function removeSample(i) {
    setSampleCases((sc) => (sc.length === 1 ? sc : sc.filter((_, idx) => idx !== i)));
  }

  function updateCase(i, key, value) {
    setTestCases((tc) => tc.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));
  }
  function addCase() {
    setTestCases((tc) => [...tc, emptyCase()]);
  }
  function removeCase(i) {
    setTestCases((tc) => (tc.length === 1 ? tc : tc.filter((_, idx) => idx !== i)));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (topics.length === 0) {
      setError('Select at least one topic.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const payload = { ...form, topics, sampleCases, starterCode, testCases };
      if (isEdit) {
        await api.patch(`/problems/${id}`, payload);
      } else {
        await api.post('/problems', payload);
      }
      invalidate('/problems'); // so the list + Submit page refetch
      toast.success(isEdit ? 'Problem updated.' : 'Problem created.');
      navigate('/problems');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save problem';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Problem authoring" title={isEdit ? 'Edit problem' : 'Create a problem'} description="Build a clear challenge with a complete statement, worked examples, and reliable tests." backTo="/problems" backLabel="Problem library" />
      <div className="card">
      <form onSubmit={onSubmit}>
        <h2 className="section-title mb-5">1. Problem details</h2>
        <label className="field">
          Title
          <input className="input" value={form.title} onChange={setField('title')} required />
        </label>
        <label className="field">
          Initial difficulty
          <select className="input" value={form.difficulty} onChange={setField('difficulty')}>
            <option value="easy">Easy · 100 XP</option>
            <option value="medium">Medium · 200 XP</option>
            <option value="hard">Hard · 300 XP</option>
          </select>
          <span className="text-xs text-slate-500">Updated from solve rates once enough students attempt the problem.</span>
        </label>
        <label className="field">
          Description
          <textarea
            className="input min-h-24"
            value={form.description}
            onChange={setField('description')}
            required
          />
        </label>

        <div className="field">
          <span>
            Topics <span className="text-slate-400 dark:text-slate-500">(select at least one)</span>
          </span>
          <TopicSelect selected={topics} onChange={setTopics} />
        </div>

        <h2 className="section-title mb-5 mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">2. Statement & examples</h2>
        <label className="field">
          Input format
          <textarea
            className="input min-h-20"
            value={form.inputFormat}
            onChange={setField('inputFormat')}
            placeholder="e.g. Line 1: n — the number of elements. Line 2: n space-separated integers."
            required
          />
        </label>
        <label className="field">
          Output format
          <textarea
            className="input min-h-20"
            value={form.outputFormat}
            onChange={setField('outputFormat')}
            placeholder="e.g. A single integer — the sum of the elements."
            required
          />
        </label>
        <label className="field">
          Constraints
          <textarea
            className="input min-h-20"
            value={form.constraints}
            onChange={setField('constraints')}
            placeholder={'e.g. 1 <= n <= 1000\n-10^9 <= a[i] <= 10^9'}
            required
          />
        </label>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Sample examples{' '}
              <span className="text-slate-400 dark:text-slate-500">(shown to students)</span>
            </span>
            <button type="button" className="btn-ghost btn-sm" onClick={addSample}>
              + Add example
            </button>
          </div>
          <div className="space-y-3">
            {sampleCases.map((s, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Example {i + 1}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost btn-sm text-red-600 dark:text-red-400"
                    aria-label={`Remove example ${i + 1}`}
                    onClick={() => removeSample(i)}
                    disabled={sampleCases.length === 1}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
                  <textarea
                    className="input flex-1 font-mono text-sm"
                    aria-label={`Example ${i + 1} input`}
                    placeholder="sample input"
                    value={s.input}
                    onChange={(e) => updateSample(i, 'input', e.target.value)}
                    rows={2}
                    required
                  />
                  <textarea
                    className="input flex-1 font-mono text-sm"
                    aria-label={`Example ${i + 1} output`}
                    placeholder="sample output"
                    value={s.output}
                    onChange={(e) => updateSample(i, 'output', e.target.value)}
                    rows={2}
                    required
                  />
                </div>
                <textarea
                  className="input mt-2 w-full text-sm"
                  aria-label={`Example ${i + 1} explanation`}
                  placeholder="explanation (optional)"
                  value={s.explanation}
                  onChange={(e) => updateSample(i, 'explanation', e.target.value)}
                  rows={2}
                />
              </div>
            ))}
          </div>
        </div>

        <h2 className="section-title mb-5 mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">3. Starter code & test cases</h2>
        {/* Optional starter code per language. Test cases are language-agnostic;
            starter code is just convenience boilerplate students can start from. */}
        <div className="field">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span>Starter code (optional, per language)</span>
            <div className="flex flex-wrap gap-1">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={activeLang === lang}
                  className={activeLang === lang ? tabActive : tabIdle}
                  onClick={() => setActiveLang(lang)}
                >
                  {LANGUAGE_LABELS[lang]}
                  {starterCode[lang]?.trim() ? ' •' : ''}
                </button>
              ))}
            </div>
            {!isEdit && (
              <button type="button" className="btn-ghost btn-sm ml-auto" onClick={insertTemplate}>
                Insert {LANGUAGE_LABELS[activeLang]} template
              </button>
            )}
          </div>
          <CodeEditor
            language={activeLang}
            value={starterCode[activeLang]}
            onChange={(v) => setLangCode(activeLang, v)}
            height="240px"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Optional {LANGUAGE_LABELS[activeLang]} starter code — leave blank if none.
          </p>
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Test cases
            </span>
            <button type="button" className="btn-ghost btn-sm" onClick={addCase}>
              + Add test case
            </button>
          </div>
          <div className="space-y-2">
            {testCases.map((tc, i) => (
              <div key={i} className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
                <textarea
                  className="input flex-1 font-mono text-sm"
                  aria-label={`Test case ${i + 1} input`}
                  placeholder="input (stdin)"
                  value={tc.input}
                  onChange={(e) => updateCase(i, 'input', e.target.value)}
                  rows={2}
                />
                <textarea
                  className="input flex-1 font-mono text-sm"
                  aria-label={`Test case ${i + 1} expected output`}
                  placeholder="expected output"
                  value={tc.expectedOutput}
                  onChange={(e) => updateCase(i, 'expectedOutput', e.target.value)}
                  rows={2}
                />
                <button
                  type="button"
                  className="btn-ghost btn-sm text-red-600 dark:text-red-400"
                  aria-label={`Remove test case ${i + 1}`}
                  onClick={() => removeCase(i)}
                  disabled={testCases.length === 1}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <ErrorState message={error} />}
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create problem'}
        </button>
      </form>
      </div>
    </div>
  );
}
