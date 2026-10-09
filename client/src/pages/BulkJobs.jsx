import toast from 'react-hot-toast';
import { PageHeader, EmptyState, StatusBadge } from '../components/UI.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { useEffect, useState } from 'react';
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
      toast.success("Job queued. Track its progress below.");
      await jobs.refetch();
    } catch (err) { const message = err.response?.data?.error || err.message || 'Unable to start job'; setError(message); toast.error(message); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(job.result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${job.type}-${job._id}.json`;
    link.click(); toast.success("Download started."); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-5">
    <PageHeader eyebrow="Teaching tools" title="Imports and reports" description="Manage your problem library in batches and turn submission data into useful insight." backTo="/dashboard" backLabel="Overview" />
    <section className="card">
      <h2 className="section-title mb-3">Import your problem library</h2>
      <p className="mb-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Import up to 100 problems as JSON. Every problem needs the same fields as the create-problem form. Exports and reports include only problems you created.</p>
      <label className="field">Problem JSON<textarea className="input min-h-48 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"problems": [...]}' /></label>
      <div className="flex flex-wrap gap-3">
        <button className="btn" disabled={busy || !text.trim()} onClick={() => start('problem-import')}>Import problems</button>
        <button className="btn-secondary" disabled={busy} onClick={() => start('problem-export')}>Export my problems</button>
        <button className="btn-secondary" disabled={busy} onClick={() => start('report-export')}>Generate grading report</button>
      </div>
      {(error || jobs.error || selected.error) && <p role="alert" className="error-state">{error || jobs.error || selected.error}</p>}
    </section>
    {selected.loading && <LoadingSpinner label="Loading job details…" />}
    {job && <section className="card" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">{{ 'problem-import': 'Problem import', 'problem-export': 'Problem export', 'report-export': 'Grading report' }[job.type] || job.type}</h2><StatusBadge status={job.status} /></div>
      {job.type === 'problem-import' && job.result && <p className="mt-2 text-sm">Imported {job.result.importedCount} problems.</p>}
      {job.status === 'failed' && <p className="error-state">{job.error} {job.type === 'problem-import' && 'Any already imported problems remain saved.'}</p>}
      {job.status === 'completed' && job.type !== 'problem-import' && <button className="btn mt-3" onClick={download}>Download JSON</button>}
    </section>}
    <section className="card"><h2 className="section-title mb-5">Recent jobs</h2>
      {jobs.loading && <LoadingSpinner />}
      {jobs.data?.jobs?.length === 0 && <EmptyState icon="upload" title="Your first job starts here" description="Import problems or create an export. You can return here to check progress and download results." />}
      <ul className="space-y-2">{jobs.data?.jobs?.map((item) => <li key={item._id}><button className="list-row flex w-full flex-wrap items-center justify-between gap-3 text-left" onClick={() => { setPollSelected(true); setSelectedId(item._id); }}><span><span className="block text-sm font-semibold">{{ 'problem-import': 'Problem import', 'problem-export': 'Problem export', 'report-export': 'Grading report' }[item.type] || item.type}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{new Date(item.createdAt).toLocaleString()}</span></span><StatusBadge status={item.status} /></button></li>)}</ul>
    </section>
  </div>;
}
