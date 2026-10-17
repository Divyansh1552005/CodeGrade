import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { invalidate } from '../api/useCachedQuery.js';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
import { Button, ErrorState, Field, Input, PageHeader } from '../components/ui/index.js';

export default function AskDoubt() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.body.trim()) {
      setError('Describe your doubt before posting it.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/doubts', form);
      invalidate('/doubts');
      toast.success('Doubt posted. An AI draft is being prepared.');
      // Go to the new doubt's detail page (the AI draft is being prepared).
      navigate(`/doubts/${data.doubt._id}`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to post the doubt. Check your connection and try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Ask a doubt" description="Say what you tried and where you got stuck." backTo="/doubts" backLabel="Doubts" />
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Why does my loop skip the last element?" maxLength={200} required />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Details</span>
          <MarkdownEditor
            value={form.body}
            onChange={(v) => setForm({ ...form, body: v })}
            placeholder="Describe your doubt. Markdown, lists and code blocks are supported."
            autoGrow
            minH="min-h-64"
            label="Question details"
          />
          <p className="text-sm text-fg-muted">A teacher reviews every answer before it is shared with you.</p>
        </div>
        <Button type="submit" variant="primary" loading={busy}>Post doubt</Button>
        {error && <ErrorState message={error} />}
      </form>
    </div>
  );
}
