import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';
import MarkdownEditor from '../components/MarkdownEditor.jsx';

export default function AskDoubt() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.body.trim()) {
      setError('Please describe your doubt.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/doubts', form);
      invalidate('/doubts');
      // Go to the new doubt's detail page (the AI draft is being prepared).
      navigate(`/doubts/${data.doubt._id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post doubt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3">
        <Link to="/doubts" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to board
        </Link>
      </div>
      <div className="card">
        <h1 className="mb-4 text-xl font-semibold">Ask a Doubt</h1>
        <form onSubmit={onSubmit}>
          <label className="field">
            Title
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <div className="field">
            <span>Details (markdown supported)</span>
            <MarkdownEditor
              value={form.body}
              onChange={(v) => setForm({ ...form, body: v })}
              placeholder="Describe your doubt. You can use **markdown**, lists, and ```code``` blocks."
              autoGrow
              minH="min-h-48"
            />
          </div>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <button className="btn" disabled={busy}>
            {busy ? 'Posting…' : 'Post Doubt'}
          </button>
        </form>
      </div>
    </div>
  );
}
