import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { invalidate, useCachedQuery } from '../api/useCachedQuery.js';
import { useFeatures } from '../lib/useFeatures.js';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
import { Button, ErrorState, Field, Input, PageHeader, Select, Textarea } from '../components/ui/index.js';

const CODE_MAX = 4000;

export default function AskDoubt() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { aiTriage } = useFeatures();
  // Opened from a problem page, the problem is already selected.
  const [form, setForm] = useState({ title: '', body: '', code: '', problemId: params.get('problem') || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const problems = useCachedQuery('/problems');
  const list = problems.data?.problems ?? [];

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.body.trim()) {
      setError('Describe your doubt before posting it.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = { title: form.title, body: form.body };
      if (form.problemId) payload.problemId = form.problemId;
      if (form.code.trim()) payload.code = form.code;
      const { data } = await api.post('/doubts', payload);
      invalidate('/doubts');
      toast.success(aiTriage ? 'Doubt posted. We are checking it before it is shared.' : 'Doubt posted. An AI draft is being prepared.');
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
        <Field label="Problem (optional)" hint="Pick the problem this doubt is about so a teacher has the context.">
          <Select value={form.problemId} onChange={(e) => setForm({ ...form, problemId: e.target.value })} disabled={problems.loading && !list.length}>
            <option value="">No specific problem</option>
            {list.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
          </Select>
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
        </div>
        <Field label="Code snippet (optional)" hint={`Up to ${CODE_MAX.toLocaleString()} characters. Paste only the part that matters.`}>
          <Textarea className="min-h-32 font-mono text-sm" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={CODE_MAX} spellCheck={false} />
        </Field>
        <p className="text-sm text-fg-muted">A teacher reviews every answer before it is shared with you.</p>
        <Button type="submit" variant="primary" loading={busy}>Post doubt</Button>
        {error && <ErrorState message={error} />}
      </form>
    </div>
  );
}
