import { Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCachedQuery } from '../api/useCachedQuery.js';
import NextUp from '../components/dashboard/NextUp.jsx';
import ProgressSummary from '../components/dashboard/ProgressSummary.jsx';
import RecentSubmissions from '../components/dashboard/RecentSubmissions.jsx';
import ProgressBreakdown from '../components/dashboard/ProgressBreakdown.jsx';
import Badges from '../components/dashboard/Badges.jsx';
import Notifications from '../components/dashboard/Notifications.jsx';
import { Button, Icon, PageHeader, Panel, PanelBody, PanelHeader } from '../components/ui/index.js';

export default function Dashboard() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const isTeacher = user.role === 'teacher';
  const library = useCachedQuery('/problems/stats/counts');
  const problems = useCachedQuery('/problems', { enabled: isStudent });
  const history = useCachedQuery('/submissions', { key: `dashboard-submissions:${user._id}`, enabled: isStudent, refetchInterval: 10000 });
  const progress = useCachedQuery('/activity/progress', { key: `progress:${user._id}`, enabled: isStudent, refetchInterval: 10000 });
  const pending = useCachedQuery('/answers?state=pending', { key: 'answers:pending', enabled: isTeacher, refetchInterval: 10000 });
  const notifications = useCachedQuery('/activity/notifications', { key: `notifications:${user._id}`, refetchInterval: 10000 });

  if (isTeacher) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" action={<Button variant="primary" to="/problems/new"><Icon as={Plus} />Create problem</Button>} />
        <div className="grid gap-4 md:grid-cols-2">
          <Panel aria-label="Review queue">
            <PanelHeader title="Review queue" action={<Button size="sm" to="/review">Open queue</Button>} />
            <PanelBody>
              <p className="text-xl font-semibold tabular-nums">{pending.error ? '-' : pending.data?.answers?.length ?? '-'}</p>
              <p className="text-sm text-fg-muted">{pending.error || 'AI-drafted answers awaiting your review'}</p>
            </PanelBody>
          </Panel>
          <Panel aria-label="Problem library">
            <PanelHeader title="Problems" action={<Button size="sm" to="/problems">View problems</Button>} />
            <PanelBody>
              <p className="text-xl font-semibold tabular-nums">{library.error ? '-' : library.data?.total ?? '-'}</p>
              <p className="text-sm text-fg-muted">{library.error || 'Problems in the library'}</p>
            </PanelBody>
          </Panel>
        </div>
        <Notifications query={notifications} />
      </div>
    );
  }

  const problemList = problems.data?.problems ?? [];
  const submissions = history.data?.submissions ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextUp problems={problemList} submissions={submissions} loading={problems.loading || history.loading} error={problems.error || history.error} onRetry={() => { problems.refetch(); history.refetch(); }} />
        </div>
        <ProgressSummary stats={progress.data?.progress} loading={progress.loading} error={progress.error} onRetry={progress.refetch} />
      </div>
      <RecentSubmissions submissions={submissions} loading={history.loading} error={history.error} onRetry={history.refetch} />
      <div className="grid gap-4 md:grid-cols-2">
        <ProgressBreakdown problems={problemList} loading={problems.loading} error={problems.error} onRetry={problems.refetch} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Badges badges={progress.data?.progress?.badges} />
        <Notifications query={notifications} />
      </div>
    </div>
  );
}
