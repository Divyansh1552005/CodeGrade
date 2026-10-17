import toast from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { useCachedQuery, invalidate } from '../api/useCachedQuery.js';
import {
  Button, EmptyState, ErrorState, Field, PageHeader, Panel, PanelBody, PanelHeader, Skeleton, StatusBadge, TBody, Table, TableSkeleton, Td, Textarea, Th, THead, Tr,
} from '../components/ui/index.js';

const JOB_LABELS = { 'problem-import': 'Problem import', 'problem-export': 'Problem export', 'report-export': 'Grading report' };

export default function BulkJobs() {
  const { user } = useAuth();
  const [pollSelected, setPollSelected] = useState(true);
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const jobs = useCachedQuery('/jobs', { key: `jobs:${user._id}`, refetchInterval: 5000 });
  const selected = useCachedQuery(selectedId ? `/jobs/${selectedId}` : '', { enabled: Boolean(selectedId), refetchInterval: pollSelected ? 2000 : 0 });
  const job = selected.data?.job;
  useEffect(() => {
    if (['completed', 'failed'].includes(job?.status)) setPollSelected(false);
    if (job?.status === 'completed' && job.type === 'problem-import') invalidate('/problems');
  }, [job?._id, job?.status, job?.type]);
  async function start(type) {
    setBusy(type); setError('');
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
      toast.success('Job queued. Track its progress below.');
      await jobs.refetch();
    } catch (err) { const message = err.response?.data?.error || err.message || 'Unable to start the job. Try again.'; setError(message); toast.error(message); }
    finally { setBusy(''); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(job.result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${job.type}-${job._id}.json`;
    link.click(); toast.success('Download started.'); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const jobList = jobs.data?.jobs;
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Imports and reports" backTo="/dashboard" backLabel="Dashboard" />

      <section aria-labelledby="import-heading" className="space-y-4">
        <div>
          <h2 id="import-heading" className="text-md font-semibold">Import problems</h2>
          <p className="mt-1 text-base text-fg-muted">Import up to 100 problems as JSON. Each problem needs the same fields as the create-problem form. Exports and reports include only problems you created.</p>
        </div>
        <Field label="Problem JSON"><Textarea className="min-h-48 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"problems": [...]}' /></Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={busy === 'problem-import'} disabled={Boolean(busy) || !text.trim()} onClick={() => start('problem-import')}>Import problems</Button>
          <Button loading={busy === 'problem-export'} disabled={Boolean(busy)} onClick={() => start('problem-export')}>Export my problems</Button>
          <Button loading={busy === 'report-export'} disabled={Boolean(busy)} onClick={() => start('report-export')}>Generate grading report</Button>
        </div>
        {(error || jobs.error || selected.error) && <ErrorState message={error || jobs.error || selected.error} />}
      </section>

      {selected.loading && !job && <Skeleton className="h-24 w-full" />}
      {job && (
        <Panel aria-label="Selected job" aria-live="polite">
          <PanelHeader title={JOB_LABELS[job.type] || job.type} action={<StatusBadge status={job.status} />} />
          <PanelBody className="space-y-3">
            {job.type === 'problem-import' && job.result && <p className="text-base">Imported {job.result.importedCount} problems.</p>}
            {job.status === 'failed' && <ErrorState message={`${job.error || 'The job failed.'} ${job.type === 'problem-import' ? 'Any problems already imported remain saved.' : ''}`.trim()} />}
            {['queued', 'pending', 'running'].includes(job.status) && <p className="text-base text-fg-muted">This job is still running. Status updates automatically.</p>}
            {job.status === 'completed' && job.type !== 'problem-import' && <Button variant="primary" onClick={download}>Download JSON</Button>}
          </PanelBody>
        </Panel>
      )}

      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" className="mb-2 text-md font-semibold">Recent jobs</h2>
        {jobs.loading && !jobList && <TableSkeleton rows={3} columns={3} />}
        {jobList?.length === 0 && <EmptyState icon={Upload} title="No jobs yet" description="Import problems or create an export. Come back here to check progress and download results." />}
        {jobList?.length > 0 && (
          <Table aria-label="Recent jobs">
            <THead>
              <Tr className="hover:bg-transparent"><Th>Job</Th><Th>Status</Th><Th className="hidden sm:table-cell">Created</Th></Tr>
            </THead>
            <TBody>
              {jobList.map((item) => (
                <Tr key={item._id}>
                  <Td>
                    <button type="button" aria-current={item._id === selectedId ? 'true' : undefined} className="rounded-sm font-medium hover:text-accent-text hover:underline" onClick={() => { setPollSelected(true); setSelectedId(item._id); }}>
                      {JOB_LABELS[item.type] || item.type}
                    </button>
                  </Td>
                  <Td><StatusBadge status={item.status} /></Td>
                  <Td className="hidden whitespace-nowrap text-fg-muted sm:table-cell">{new Date(item.createdAt).toLocaleString()}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
