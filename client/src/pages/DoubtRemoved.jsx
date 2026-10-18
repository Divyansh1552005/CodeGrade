import { useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileSearch } from 'lucide-react';
import { api } from '../api/client.js';
import { invalidate, useCachedQuery } from '../api/useCachedQuery.js';
import Markdown from '../components/Markdown.jsx';
import { Button, EmptyState, ErrorState, PageHeader, PageSkeleton, Panel, PanelBody, PanelHeader } from '../components/ui/index.js';

const NOT_FOUND = 'Doubt not found';

/**
 * Where the removal notification leads. Only the author can open it (everyone else, and any
 * doubt that was not removed, gets a 404 from the server). It shows the reason and a single
 * "Request teacher review" action.
 */
export default function DoubtRemoved() {
  const { id } = useParams();
  const query = useCachedQuery(`/doubts/${id}/removed`, { key: `removed:${id}` });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const doubt = query.data?.doubt;

  async function appeal() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/doubts/${id}/appeal`);
      invalidate('/doubts');
      toast.success('Review requested.');
      await query.refetch();
    } catch (err) {
      const message = err.response?.data?.error || 'Could not send the request. Check your connection and try again.';
      setError(message);
      if (err.response?.status === 409) query.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (query.loading && !doubt) return <PageSkeleton />;
  if (query.error === NOT_FOUND) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Page not available" backTo="/doubts" backLabel="Doubts" />
        <EmptyState icon={FileSearch} title="This page is not available" description="It may not exist, or it may belong to someone else." action={<Button variant="primary" to="/doubts">Go to doubts</Button>} />
      </div>
    );
  }
  if (query.error) return <ErrorState message={query.error} onRetry={query.refetch} />;
  if (!doubt) return null;

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title={doubt.offTopic ? 'Your doubt was marked off topic' : 'Your doubt was removed'} backTo="/doubts" backLabel="Doubts" />
      <Panel aria-label="Reason">
        <PanelHeader title={doubt.offTopic ? 'Why it was marked off topic' : 'Why it was removed'} />
        <PanelBody><p className="text-base">{doubt.reason}</p></PanelBody>
      </Panel>
      <Panel aria-label="Your doubt">
        <PanelHeader title={doubt.title} />
        <PanelBody><Markdown>{doubt.body}</Markdown></PanelBody>
      </Panel>
      {doubt.appealed ? (
        <div role="status" className="space-y-3">
          <p className="text-base">You asked for a teacher to review this doubt. It is back on the doubts board and a teacher will answer it directly.</p>
          <Button to={`/doubts/${id}`}>Open the doubt</Button>
        </div>
      ) : doubt.canAppeal ? (
        <div className="space-y-3">
          <p className="text-base text-fg-muted">If you think this was a mistake, a teacher will read it and answer it directly. You can ask once.</p>
          <Button variant="primary" loading={busy} onClick={appeal}>Request teacher review</Button>
          {error && <ErrorState message={error} />}
        </div>
      ) : null}
    </div>
  );
}
