import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';

export default function BulkJobs() {
  const { user } = useAuth();
  const [pollSelected, setPollSelected] = useState(true);
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const jobs = useCachedQuery('/jobs', { key: `jobs:${user._id}`, refetchInterval: 5000 });
  const selected = useCachedQuery(selectedId ? `/jobs/${selectedId}` : '', { enabled: Boolean(selectedId), refetchInterval: pollSelected ? 2000 : 0 });
  const job = selected.data?.job;
  useEffect(() => {
    if (['completed', 'failed'].includes(job?.status)) setPollSelected(false);
    if (job?.status === 'completed' && job.type === 'problem-import') invalidate('/problems');
  }, [job?._id, job?.status, job?.type]);
  async function start(type) {
    setBusy(true); setError('');
    try {
      let problems;
      if (type === 'problem-import') {
        const parsed = JSON.parse(text);
        problems = Array.isArray(parsed) ? parsed : parsed.problems;
        if (!Array.isArray(problems)) throw new Error('Provide a JSON array or an object containing a problems array.');
      }
      const res = await api.post('/jobs', { type, ...(problems ? { problems } : {}) });
      setPollSelected(true);
      setSelectedId(res.data.job._id);
      await jobs.refetch();
    } catch (err) { setError(err.response?.data?.error || err.message || 'Unable to start job'); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(job.result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${job.type}-${job._id}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-5">
    <Link to="/dashboard" className="text-sm underline">← Dashboard</Link>
    <section className="card">
      <h1 className="mb-3 text-xl font-semibold">Imports and reports</h1>
      <p className="mb-3 text-sm text-slate-500">Import up to 100 problems as JSON. Every problem needs the same fields as the create-problem form. Exports and reports include only problems you created.</p>
      <label className="field">Problem JSON<textarea className="input min-h-48 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"problems": [...]}' /></label>
      <div className="flex flex-wrap gap-3">
        <button className="btn" disabled={busy || !text.trim()} onClick={() => start('problem-import')}>Import problems</button>
        <button className="btn" disabled={busy} onClick={() => start('problem-export')}>Export my problems</button>
        <button className="btn" disabled={busy} onClick={() => start('report-export')}>Generate grading report</button>
      </div>
      {(error || jobs.error || selected.error) && <p role="alert" className="mt-3 text-sm text-red-600">{error || jobs.error || selected.error}</p>}
    </section>
    {job && <section className="card" aria-live="polite">
      <h2 className="font-semibold">{job.type}: {job.status}</h2>
      {job.type === 'problem-import' && job.result && <p className="mt-2 text-sm">Imported {job.result.importedCount} problems.</p>}
      {job.status === 'failed' && <p className="mt-2 text-sm text-red-600">{job.error} {job.type === 'problem-import' && 'Any already imported problems remain saved.'}</p>}
      {job.status === 'completed' && job.type !== 'problem-import' && <button className="btn mt-3" onClick={download}>Download JSON</button>}
    </section>}
    <section className="card"><h2 className="mb-3 font-semibold">Recent jobs</h2>
      <ul className="space-y-2">{jobs.data?.jobs?.map((item) => <li key={item._id}><button className="text-sm underline" onClick={() => { setPollSelected(true); setSelectedId(item._id); }}>{item.type} · {item.status} · {new Date(item.createdAt).toLocaleString()}</button></li>)}</ul>
    </section>
  </div>;
}
