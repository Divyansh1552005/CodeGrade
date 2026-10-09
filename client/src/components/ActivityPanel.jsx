import { useState } from 'react';
import { TOPICS } from '../data/topics.js';
import { Link } from 'react-router-dom';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { api } from '../api/client.js';

export default function ActivityPanel({ isStudent, userId }) {
  const [topic, setTopic] = useState('');
  const leaderboardUrl = topic ? `/leaderboard?scope=topic&topic=${encodeURIComponent(topic)}` : '/leaderboard?scope=global';
  const progress = useCachedQuery('/activity/progress', { key: `progress:${userId}`, enabled: isStudent, refetchInterval: 10000 });
  const leaderboard = useCachedQuery(leaderboardUrl, { key: `leaderboard:${userId}:${topic}`, refetchInterval: 30000 });
  const notifications = useCachedQuery('/activity/notifications', { key: `notifications:${userId}`, refetchInterval: 10000 });
  const stats = progress.data?.progress;
  const percent = stats ? Math.max(0, Math.min(100, 100 * stats.xpIntoLevel / stats.xpForNextLevel)) : 0;
  async function markRead(id) {
    try { await api.patch(`/activity/notifications/${id}/read`); await notifications.refetch(); }
    catch { /* Keep the unread state so the user can retry. */ }
  }
  return <div className="grid gap-4 sm:grid-cols-2">
    {isStudent && <section className="card">
      <h2 className="mb-3 font-semibold">Your progress</h2>
      {progress.error && <p role="alert" className="text-sm text-red-600">{progress.error}</p>}
      <p className="text-lg font-semibold">Level {stats?.level ?? 1} · {stats?.xp ?? '—'} XP</p>
      <div role="progressbar" aria-label="XP toward next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{stats?.xpIntoLevel ?? 0} / {stats?.xpForNextLevel ?? 100} XP toward level {(stats?.level ?? 1) + 1}</p>
      <p className="mt-3"><span role="img" aria-label="Streak flame">🔥</span> {stats?.currentStreak ?? '—'} day streak · {stats?.longestStreak ?? '—'} day best</p>
      <p className="mt-2 text-sm text-slate-500">{stats?.solvedCount ?? '—'} problems solved · Easy 100 / Medium 200 / Hard 300 XP</p>
      <p className="mt-1 text-xs text-slate-500">XP for first solves. Successful solves keep your streak going; days use UTC.</p>
      <h3 className="mt-4 text-sm font-semibold">Badge shelf</h3>
      <div className="mt-2 flex flex-wrap gap-2">{stats?.badges?.map((badge) => <span key={badge.key} title={badge.description} className="badge">{badge.icon} {badge.name}</span>)}</div>
      {stats?.badges?.length === 0 && <p className="mt-2 text-xs text-slate-500">Your first solve unlocks your first badge.</p>}
    </section>}
    <section className="card">
      <h2 className="mb-3 font-semibold">Leaderboard</h2>
      <label className="mb-3 block text-sm">Leaderboard scope
        <select className="input mt-1" value={topic} onChange={(event) => setTopic(event.target.value)}>
          <option value="">Global</option>
          {TOPICS.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
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
