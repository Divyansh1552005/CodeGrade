import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TOPICS } from '../data/topics.js';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { api } from '../api/client.js';
import { Icon, EmptyState, ErrorState } from './UI.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

export default function ActivityPanel({ isStudent, userId }) {
  const [topic, setTopic] = useState('');
  const leaderboardUrl = topic ? `/leaderboard?scope=topic&topic=${encodeURIComponent(topic)}` : '/leaderboard?scope=global';
  const progress = useCachedQuery('/activity/progress', { key: `progress:${userId}`, enabled: isStudent, refetchInterval: 10000 });
  const leaderboard = useCachedQuery(leaderboardUrl, { key: `leaderboard:${userId}:${topic}`, refetchInterval: 30000 });
  const notifications = useCachedQuery('/activity/notifications', { key: `notifications:${userId}`, refetchInterval: 10000 });
  const stats = progress.data?.progress;
  const [readingId, setReadingId] = useState('');
  const [readError, setReadError] = useState('');
  const percent = stats ? Math.max(0, Math.min(100, 100 * stats.xpIntoLevel / stats.xpForNextLevel)) : 0;
  async function markRead(id) {
    setReadingId(id); setReadError('');
    try { await api.patch(`/activity/notifications/${id}/read`); await notifications.refetch(); }
    catch { setReadError('Unable to mark this notification as read. Please try again.'); }
    finally { setReadingId(''); }
  }
  return <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
    {isStudent && <section className="card">
      <div className="mb-6 flex items-center justify-between"><h2 className="section-title">Your progress</h2><span className="badge !bg-indigo-50 !text-indigo-600 dark:!bg-indigo-500/10 dark:!text-indigo-300"><Icon name="trophy" className="h-3.5 w-3.5" />Keep growing</span></div>
      {progress.error && <ErrorState message={progress.error} onRetry={progress.refetch} />}
      {progress.loading && <LoadingSpinner label="Loading your progress…" />}
      <p className="text-2xl font-bold tabular-nums">Level {stats?.level ?? 1} · {stats?.xp ?? '—'} XP</p>
      <div role="progressbar" aria-label="XP toward next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} /></div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{stats?.xpIntoLevel ?? 0} / {stats?.xpForNextLevel ?? 100} XP toward level {(stats?.level ?? 1) + 1}</p>
      <div className="mt-6 rounded-xl bg-amber-50 px-4 py-4 dark:bg-amber-500/5"><p className="font-semibold"><span role="img" aria-label="Streak flame">🔥</span> {stats?.currentStreak ?? '—'} day streak · {stats?.longestStreak ?? '—'} day best</p><p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">Successful solves keep your streak going. Days use UTC.</p></div>
      <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{stats?.solvedCount ?? '—'} problems solved · First solves earn Easy 100 / Medium 200 / Hard 300 XP</p>
      <div className="mt-7 border-t border-slate-100 pt-5 dark:border-slate-800"><h3 className="text-sm font-semibold">Badge shelf</h3><div className="mt-3 flex flex-wrap gap-2">{stats?.badges?.map((badge) => <span key={badge.key} title={badge.description} className="badge !rounded-lg !border !border-indigo-100 !bg-indigo-50 !px-3 !py-2 !text-indigo-700 dark:!border-indigo-500/20 dark:!bg-indigo-500/10 dark:!text-indigo-300">{badge.icon} {badge.name}</span>)}</div>{stats?.badges?.length === 0 && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Your first solve unlocks your first badge.</p>}</div>
    </section>}
    <section className={`card ${isStudent ? '' : 'xl:col-span-2'}`}>
      <div className="mb-5 flex items-center justify-between"><h2 className="section-title">Leaderboard</h2><Icon name="trophy" className="h-4 w-4 text-indigo-500" /></div>
      <label className="mb-5 block text-xs font-medium text-slate-500 dark:text-slate-400">Leaderboard scope<select className="input mt-2" value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">Global</option>{TOPICS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      {leaderboard.error && <ErrorState message={leaderboard.error} onRetry={leaderboard.refetch} />}
      {leaderboard.loading && <LoadingSpinner />}
      <ol className="divide-y divide-slate-100 dark:divide-slate-800">{leaderboard.data?.entries?.map((entry, index) => <li key={entry._id} className="flex items-center justify-between gap-3 py-3.5 text-sm"><span className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{String(index + 1).padStart(2, '0')}</span><span className="truncate font-medium">{index + 1}. {entry.studentId.name}</span></span><span className="shrink-0 font-semibold tabular-nums text-indigo-600 dark:text-indigo-300">{entry.xp} XP</span></li>)}</ol>
      {leaderboard.data?.entries?.length === 0 && <EmptyState icon="trophy" title="The next spot could be yours" description="Complete a problem to start earning XP and appear here." />}
    </section>
    <section className="card xl:col-span-2">
      <div className="mb-4 flex items-center gap-2"><Icon name="bell" className="h-4 w-4 text-indigo-500" /><h2 className="section-title">Notifications</h2></div>
      {(notifications.error || readError) && <ErrorState message={notifications.error || readError} />}
      {notifications.loading && <LoadingSpinner />}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">{notifications.data?.notifications?.map((notice) => <li key={notice._id} className="flex flex-col gap-3 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"><Link className={`leading-6 ${notice.readAt ? 'text-slate-500 dark:text-slate-400' : 'font-medium text-indigo-700 dark:text-indigo-300'}`} to={notice.href}>{!notice.readAt && <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />}{notice.message}</Link>{!notice.readAt && <button className="btn-ghost btn-sm shrink-0 self-start" disabled={Boolean(readingId)} onClick={() => markRead(notice._id)}>{readingId === notice._id ? 'Updating…' : 'Mark read'}</button>}</li>)}</ul>
      {notifications.data?.notifications?.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">You’re up to date. Teacher-approved answers will appear here.</p>}
    </section>
  </div>;
}
