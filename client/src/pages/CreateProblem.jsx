import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';
import { STARTER_TEMPLATES, LANGUAGE_LABELS } from '../data/starterTemplates.js';
import CodeEditor from '../components/CodeEditor.jsx';
import TopicSelect from '../components/TopicSelect.jsx';
import { Button, ErrorState, Field, Icon, Input, PageHeader, Select, Tabs, TabsList, TabsTrigger, Textarea } from '../components/ui/index.js';

const emptyCase = () => ({ input: '', expectedOutput: '' });
const emptySample = () => ({ input: '', output: '', explanation: '' });
const LANGUAGES = ['javascript', 'python', 'java', 'cpp'];
const emptyStarter = () => ({ javascript: '', python: '', java: '', cpp: '' });

function Section({ title, children }) {
  return (
    <section className="space-y-4 border-t border-border pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-md font-semibold">{title}</h2>
      {children}
    </section>
  );
}

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
  // Public worked examples. At least one is required.
  const [sampleCases, setSampleCases] = useState([emptySample()]);
  // Fixed, LeetCode-style categorization. At least one is required.
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
      .catch((err) => setError(err.response?.data?.error || 'Failed to load the problem. Check your connection and try again.'));
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
      const msg = err.response?.data?.error || 'Failed to save the problem. Check your connection and try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title={isEdit ? 'Edit problem' : 'Create a problem'} backTo="/problems" backLabel="Problems" />
      <form className="space-y-8" onSubmit={onSubmit}>
        <Section title="Details">
          <Field label="Title"><Input value={form.title} onChange={setField('title')} required /></Field>
          <Field label="Initial difficulty" hint="Updated from solve rates once enough students attempt the problem.">
            <Select value={form.difficulty} onChange={setField('difficulty')}>
              <option value="easy">Easy (100 XP)</option>
              <option value="medium">Medium (200 XP)</option>
              <option value="hard">Hard (300 XP)</option>
            </Select>
          </Field>
          <Field label="Description"><Textarea className="min-h-32" value={form.description} onChange={setField('description')} required /></Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Topics</span>
            <TopicSelect selected={topics} onChange={setTopics} />
            <p className="text-sm text-fg-muted">Select at least one.</p>
          </div>
        </Section>

        <Section title="Statement and examples">
          <Field label="Input format"><Textarea value={form.inputFormat} onChange={setField('inputFormat')} placeholder="Line 1: n, the number of elements. Line 2: n space-separated integers." required /></Field>
          <Field label="Output format"><Textarea value={form.outputFormat} onChange={setField('outputFormat')} placeholder="A single integer: the sum of the elements." required /></Field>
          <Field label="Constraints"><Textarea value={form.constraints} onChange={setField('constraints')} placeholder={'1 <= n <= 1000\n-10^9 <= a[i] <= 10^9'} required /></Field>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium">Sample examples</h3>
                <p className="text-sm text-fg-muted">Shown to students.</p>
              </div>
              <Button size="sm" onClick={addSample}><Icon as={Plus} />Add example</Button>
            </div>
            {sampleCases.map((s, i) => (
              <fieldset key={i} className="space-y-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-medium">Example {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Textarea className="min-h-16 font-mono text-sm" aria-label={`Example ${i + 1} input`} placeholder="Sample input" value={s.input} onChange={(e) => updateSample(i, 'input', e.target.value)} rows={2} required />
                  <Textarea className="min-h-16 font-mono text-sm" aria-label={`Example ${i + 1} output`} placeholder="Sample output" value={s.output} onChange={(e) => updateSample(i, 'output', e.target.value)} rows={2} required />
                </div>
                <Textarea className="min-h-16" aria-label={`Example ${i + 1} explanation`} placeholder="Explanation (optional)" value={s.explanation} onChange={(e) => updateSample(i, 'explanation', e.target.value)} rows={2} />
                <Button size="sm" variant="ghost" aria-label={`Remove example ${i + 1}`} onClick={() => removeSample(i)} disabled={sampleCases.length === 1}><Icon as={X} />Remove</Button>
              </fieldset>
            ))}
          </div>
        </Section>

        <Section title="Starter code and test cases">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Starter code (optional, per language)</span>
              {!isEdit && <Button size="sm" onClick={insertTemplate}>Insert {LANGUAGE_LABELS[activeLang]} template</Button>}
            </div>
            <Tabs value={activeLang} onValueChange={setActiveLang}>
              <TabsList>
                {LANGUAGES.map((lang) => (
                  <TabsTrigger key={lang} value={lang}>{LANGUAGE_LABELS[lang]}{starterCode[lang]?.trim() ? ' (set)' : ''}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <CodeEditor language={activeLang} value={starterCode[activeLang]} onChange={(v) => setLangCode(activeLang, v)} height="240px" />
            <p className="text-sm text-fg-muted">Leave blank if there is no {LANGUAGE_LABELS[activeLang]} starter code.</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium">Test cases</h3>
              <Button size="sm" onClick={addCase}><Icon as={Plus} />Add test case</Button>
            </div>
            {testCases.map((tc, i) => (
              <div key={i} className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <Textarea className="min-h-16 font-mono text-sm sm:flex-1" aria-label={`Test case ${i + 1} input`} placeholder="Input (stdin)" value={tc.input} onChange={(e) => updateCase(i, 'input', e.target.value)} rows={2} />
                <Textarea className="min-h-16 font-mono text-sm sm:flex-1" aria-label={`Test case ${i + 1} expected output`} placeholder="Expected output" value={tc.expectedOutput} onChange={(e) => updateCase(i, 'expectedOutput', e.target.value)} rows={2} />
                <Button variant="ghost" iconOnly aria-label={`Remove test case ${i + 1}`} onClick={() => removeCase(i)} disabled={testCases.length === 1}><Icon as={X} /></Button>
              </div>
            ))}
          </div>
        </Section>

        <div className="flex items-center gap-2 border-t border-border pt-6">
          <Button type="submit" variant="primary" loading={busy}>{isEdit ? 'Save changes' : 'Create problem'}</Button>
          <Button to="/problems">Cancel</Button>
        </div>
        {error && <ErrorState message={error} />}
      </form>
    </div>
  );
}
