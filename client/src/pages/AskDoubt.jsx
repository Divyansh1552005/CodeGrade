import { PageHeader, ErrorState } from '../components/UI.jsx';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
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
      toast.success('Doubt posted — an AI draft is being prepared.');
      // Go to the new doubt's detail page (the AI draft is being prepared).
      navigate(`/doubts/${data.doubt._id}`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to post doubt';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Get unstuck" title="Ask a doubt" description="Tell us what you tried and where you got stuck. Clear questions lead to helpful answers." backTo="/doubts" backLabel="Doubt board" />
      <div className="card">
        <form onSubmit={onSubmit}>
          <label className="field">
            Title
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Why does my loop skip the last element?"
              maxLength={200}
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
              minH="min-h-64"
              label="Question details"
            />
          </div>
          {error && <ErrorState message={error} />}
          <p className="mb-5 text-xs leading-5 text-slate-500 dark:text-slate-400">Answers are reviewed by a teacher before they are shared with you.</p>
          <button className="btn" disabled={busy}>
            {busy ? 'Posting…' : 'Post Doubt'}
          </button>
        </form>
      </div>
    </div>
  );
}
