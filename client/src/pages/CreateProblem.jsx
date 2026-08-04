import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';
import { STARTER_TEMPLATES, LANGUAGE_LABELS } from '../data/starterTemplates.js';
import CodeEditor from '../components/CodeEditor.jsx';

const emptyCase = () => ({ input: '', expectedOutput: '' });
const LANGUAGES = ['javascript', 'python', 'java', 'cpp'];
const emptyStarter = () => ({ javascript: '', python: '', java: '', cpp: '' });

const tabBase = 'rounded-md px-3 py-1 text-xs font-medium transition';
const tabActive = `${tabBase} bg-slate-900 text-white`;
const tabIdle = `${tabBase} text-slate-600 hover:bg-slate-100`;

export default function CreateProblem() {
  const { id } = useParams(); // present => edit mode
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({ title: '', description: '' });
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
        setForm({ title: p.title || '', description: p.description || '' });
        setStarterCode({ ...emptyStarter(), ...(p.starterCode || {}) });
        setTestCases(p.testCases?.length ? p.testCases : [emptyCase()]);
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
    setError('');
    setBusy(true);
    try {
      const payload = { ...form, starterCode, testCases };
      if (isEdit) {
        await api.patch(`/problems/${id}`, payload);
      } else {
        await api.post('/problems', payload);
      }
      invalidate('/problems'); // so the list + Submit page refetch
      navigate('/problems');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save problem');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1 className="mb-4 text-xl font-semibold">
        {isEdit ? 'Edit Problem' : 'Create Problem'}
      </h1>
      <form onSubmit={onSubmit}>
        <label className="field">
          Title
          <input className="input" value={form.title} onChange={setField('title')} required />
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

        {/* Optional starter code per language. Test cases are language-agnostic;
            starter code is just convenience boilerplate students can start from. */}
        <div className="field">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span>Starter code (optional, per language)</span>
            <div className="flex gap-1">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
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
          <p className="mt-1 text-xs text-slate-400">
            Optional {LANGUAGE_LABELS[activeLang]} starter code — leave blank if none.
          </p>
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Test cases</span>
            <button type="button" className="btn-ghost btn-sm" onClick={addCase}>
              + Add test case
            </button>
          </div>
          <div className="space-y-2">
            {testCases.map((tc, i) => (
              <div key={i} className="flex items-start gap-2">
                <textarea
                  className="input flex-1 font-mono text-sm"
                  placeholder="input (stdin)"
                  value={tc.input}
                  onChange={(e) => updateCase(i, 'input', e.target.value)}
                  rows={2}
                />
                <textarea
                  className="input flex-1 font-mono text-sm"
                  placeholder="expected output"
                  value={tc.expectedOutput}
                  onChange={(e) => updateCase(i, 'expectedOutput', e.target.value)}
                  rows={2}
                />
                <button
                  type="button"
                  className="btn-ghost btn-sm text-red-600"
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

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create problem'}
        </button>
      </form>
    </div>
  );
}
