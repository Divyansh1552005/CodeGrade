import { useAuth } from '../auth/AuthContext.jsx';
import { useCachedQuery } from '../api/useCachedQuery.js';
import Badges from '../components/dashboard/Badges.jsx';
import ProgressBreakdown from '../components/dashboard/ProgressBreakdown.jsx';
import ProfileSubmissions from '../components/profile/ProfileSubmissions.jsx';
import ProfileDoubts from '../components/profile/ProfileDoubts.jsx';
import Qualifications from '../components/admin/Qualifications.jsx';
import { Avatar, Badge, ErrorState, PageHeader, Panel, PanelBody } from '../components/ui/index.js';

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';

  const stats = useCachedQuery('/problems/stats/counts');
  const problems = useCachedQuery('/problems', { enabled: isStudent });
  const progress = useCachedQuery('/activity/progress', { key: `progress:${user._id}`, enabled: isStudent });

  // A teacher sees what they were approved with. Teachers from before applications existed have none: nothing shows.
  const qualifications = useCachedQuery('/teacher-application', { key: `qualifications:${user._id}`, enabled: user.role === 'teacher' });
  const application = qualifications.data?.application;

  const p = progress.data?.progress;

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" />
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-md font-semibold">{user.name}</p>
          <p className="break-all text-base text-fg-muted">{user.email}</p>
        </div>
        <Badge className="ml-2 capitalize">{user.role}</Badge>
      </div>

      {stats.error && <ErrorState message={stats.error} onRetry={stats.refetch} />}
      <Panel aria-label="Summary">
        <PanelBody>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {isStudent ? (
              <>
                <Stat label="Solved" value={p && stats.data ? `${p.solvedCount}/${stats.data.total}` : '-'} />
                <Stat label="Level" value={p?.level ?? '-'} />
                <Stat label="XP" value={p?.xp ?? '-'} />
                <Stat label="Day streak" value={p?.currentStreak ?? '-'} />
              </>
            ) : (
              <Stat label="Problems in the library" value={stats.data?.total ?? '-'} />
            )}
          </dl>
        </PanelBody>
      </Panel>

      {application && (
        <Panel aria-label="Qualifications">
          <PanelBody>
            <h2 className="mb-3 text-md font-semibold">Your qualifications</h2>
            <Qualifications application={application} />
          </PanelBody>
        </Panel>
      )}

      {isStudent && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ProgressBreakdown problems={problems.data?.problems ?? []} loading={problems.loading} error={problems.error} onRetry={problems.refetch} />
          </div>
          <Badges badges={p?.badges} />
          <ProfileSubmissions />
          <ProfileDoubts />
        </>
      )}
    </div>
  );
}
