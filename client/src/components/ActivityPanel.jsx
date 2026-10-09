import { Link } from 'react-router-dom';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { api } from '../api/client.js';

const achievementLabels = { 'first-solve': 'First solve', 'five-solves': '5 problems solved',
  'ten-solves': '10 problems solved', 'seven-day-streak': '7-day streak' };

export default function ActivityPanel({ isStudent, userId }) {
  const progress = useCachedQuery('/activity/progress', { key: `progress:${userId}`, enabled: isStudent, refetchInterval: 10000 });
  const leaderboard = useCachedQuery('/activity/leaderboard', { refetchInterval: 30000 });
  const notifications = useCachedQuery('/activity/notifications', { key: `notifications:${userId}`, refetchInterval: 10000 });
  const stats = progress.data?.progress;
  async function markRead(id) {
    try { await api.patch(`/activity/notifications/${id}/read`); await notifications.refetch(); }
    catch { /* Keep the unread state so the user can retry. */ }
  }
  return <div className="grid gap-4 sm:grid-cols-2">
    {isStudent && <section className="card">
      <h2 className="mb-3 font-semibold">Your progress</h2>
      {progress.error && <p role="alert" className="text-sm text-red-600">{progress.error}</p>}
      <p>{stats?.xp ?? '—'} XP · {stats?.solvedCount ?? '—'} problems solved</p>
      <p className="mt-2 text-sm text-slate-500">{stats?.currentStreak ?? '—'} day current streak · {stats?.longestStreak ?? '—'} day best streak</p>
      <p className="mt-2 text-xs text-slate-500">100 XP per unique problem solved. Activity days use UTC. Progress updates after grading.</p>
      <div className="mt-3 flex flex-wrap gap-2">{stats?.achievements?.map((name) => <span key={name} className="badge">{achievementLabels[name] || name}</span>)}</div>
    </section>}
    <section className="card">
      <h2 className="mb-3 font-semibold">Leaderboard</h2>
      {leaderboard.error && <p role="alert" className="text-sm text-red-600">{leaderboard.error}</p>}
      <ol className="space-y-2">{leaderboard.data?.entries?.map((entry, index) => <li key={entry._id} className="flex justify-between text-sm">
        <span>{index + 1}. {entry.studentId.name}</span><span>{entry.xp} XP</span>
      </li>)}</ol>
      {leaderboard.data?.entries?.length === 0 && <p className="text-sm text-slate-500">Complete a problem to appear here.</p>}
    </section>
    <section className="card sm:col-span-2">
      <h2 className="mb-3 font-semibold">Notifications</h2>
      {notifications.error && <p role="alert" className="text-sm text-red-600">{notifications.error}</p>}
      <ul className="space-y-3">{notifications.data?.notifications?.map((notice) => <li key={notice._id} className="flex items-center justify-between gap-3 text-sm">
        <Link className={notice.readAt ? 'text-slate-500 underline' : 'font-medium underline'} to={notice.href}>{notice.message}</Link>
        {!notice.readAt && <button className="shrink-0 text-xs underline" onClick={() => markRead(notice._id)}>Mark read</button>}
      </li>)}</ul>
      {notifications.data?.notifications?.length === 0 && <p className="text-sm text-slate-500">No notifications yet.</p>}
    </section>
  </div>;
}
