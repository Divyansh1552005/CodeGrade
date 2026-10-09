import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import ActivityPanel from '../components/ActivityPanel.jsx';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { PageHeader, Icon, ErrorState } from '../components/UI.jsx';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}
export default function Dashboard() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const isTeacher = user.role === 'teacher';
  const library = useCachedQuery('/problems/stats/counts');
  const history = useCachedQuery('/submissions', { key: `dashboard-submissions:${user._id}`, enabled: isStudent, refetchInterval: 10000 });
  const pending = useCachedQuery('/answers?state=pending', { key: 'answers:pending', enabled: isTeacher, refetchInterval: 10000 });
  const submissions = history.data?.submissions ?? [];
  const solvedCount = new Set(submissions.filter((s) => s.status === 'graded' && s.totalCount > 0 && s.passCount === s.totalCount).map((s) => String(s.problemId?._id || s.problemId))).size;
  const metrics = [
    { label: isStudent ? 'Problems solved' : 'Awaiting review', value: isStudent ? history.loading || history.error ? '—' : solvedCount : pending.loading || pending.error ? '—' : pending.data?.answers?.length ?? 0, icon: isStudent ? 'check' : 'chat', note: isStudent ? 'Every solve is a step forward' : 'Add your expertise to AI drafts' },
    { label: 'Problems in the library', value: library.data?.total ?? '—', icon: 'book', note: 'New challenges to explore' },
    { label: isStudent ? 'Your submissions' : 'Your workspace', value: isStudent ? history.loading || history.error ? '—' : submissions.length : 'Teacher', icon: 'code', note: isStudent ? 'Practice, refine, repeat' : 'Create, review, and support' },
  ];
  const tiles = [
    { to: '/problems', title: 'Explore the library', body: isStudent ? 'Find a challenge and make your next breakthrough.' : 'Create and manage problems for your students.', icon: 'code' },
    { to: '/doubts', title: 'Visit the doubt board', body: 'Keep the conversation going with thoughtful questions and answers.', icon: 'chat' },
    ...(isTeacher ? [{ to: '/review', title: 'Review answers', body: 'Help turn AI drafts into clear, reliable guidance.', icon: 'check' }, { to: '/bulk-jobs', title: 'Imports & reports', body: 'Manage your problem library and review grading reports.', icon: 'upload' }] : []),
  ];
  return <div className="space-y-7">
    <PageHeader eyebrow={isStudent ? 'Your learning, at a glance' : 'Your classroom, at a glance'} title={`${greeting()}, ${user.name?.split(' ')[0] || 'there'}`} description={isStudent ? 'Small steps lead to better solutions. What will you work on today?' : 'Create a thoughtful challenge, review a question, and keep your students moving forward.'} action={<Link className="btn" to={isStudent ? '/problems' : '/problems/new'}>{isStudent ? 'Find a challenge' : 'Create a problem'}<Icon name="arrow" className="h-4 w-4" /></Link>} />
    {(library.error || history.error || pending.error) && <ErrorState message={library.error || history.error || pending.error} />}
    <div className="grid gap-4 sm:grid-cols-3">{metrics.map((metric) => <section className="card" key={metric.label}><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</p><span className="text-indigo-500"><Icon name={metric.icon} className="h-4 w-4" /></span></div><p className="mt-4 text-3xl font-bold tabular-nums">{metric.value}</p><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{metric.note}</p></section>)}</div>
    <section><div className="mb-4 flex items-center justify-between"><h2 className="section-title">Make your next move</h2><span className="text-xs text-slate-500 dark:text-slate-400">Your workspace shortcuts</span></div><div className={`grid gap-4 ${isTeacher ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'}`}>{tiles.map((tile) => <Link className="list-row group flex items-start gap-4 !p-5" to={tile.to} key={tile.to}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon name={tile.icon} /></span><div className="min-w-0"><h3 className="text-sm font-semibold">{tile.title}</h3><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{tile.body}</p></div><Icon name="arrow" className="ml-auto h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1" /></Link>)}</div></section>
    <ActivityPanel isStudent={isStudent} userId={user._id} />
  </div>;
}
