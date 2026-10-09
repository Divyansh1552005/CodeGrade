import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Icon } from '../components/UI.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function LandingPage() {
  const { isAuthed, loading } = useAuth();
  useEffect(() => { document.title = 'CodeGrade — Practice with purpose'; }, []);
  if (loading) return <LoadingSpinner full />;
  if (isAuthed) return <Navigate to="/dashboard" replace />;
  return <div className="space-y-16 pb-6 sm:space-y-24">
    <section className="grid items-center gap-12 py-7 lg:grid-cols-[1.1fr_1fr] lg:py-14">
      <div>
        <span className="badge !bg-indigo-50 !text-indigo-700 dark:!bg-indigo-500/10 dark:!text-indigo-300"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />Built for better learning</span>
        <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-[-0.045em] sm:text-6xl">Practice with purpose.<br /><span className="text-indigo-600 dark:text-indigo-400">Grow with every solve.</span></h1>
        <p className="mt-6 max-w-lg text-base leading-8 text-slate-500 dark:text-slate-400">A calmer way to learn code. Solve meaningful problems, get actionable feedback, and find support from your teachers—all in one workspace.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link className="btn" to="/register">Start your journey <Icon name="arrow" className="h-4 w-4" /></Link><Link className="btn-secondary" to="/login">Log in to your workspace</Link></div>
        <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">Python · JavaScript · Java · C++</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900" aria-label="Example coding workspace">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"><span className="flex items-center gap-2 text-sm font-semibold"><Icon name="code" className="h-4 w-4 text-indigo-500" />Example workspace</span><span className="pill">Python</span></div>
        <div className="p-6"><p className="eyebrow">Practice problem</p><h2 className="text-xl font-semibold">Find the sum of two numbers</h2><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Read two integers and print their sum.</p></div>
        <pre className="mx-5 overflow-x-auto rounded-xl bg-[#151c36] p-5 text-sm leading-8 text-slate-200"><code><span className="text-slate-500"># Your solution</span>{'\n'}<span className="text-indigo-300">a, b</span> = map(int, input().split()){'\n'}print(a + b)</code></pre>
        <div className="mx-5 my-5 flex items-start gap-3 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-500/10"><span className="text-emerald-600 dark:text-emerald-300"><Icon name="check" /></span><div><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">A clear solution. A useful next step.</p><p className="mt-1 text-xs leading-5 text-emerald-700 dark:text-emerald-400">Test your approach, review feedback, and keep learning.</p></div></div>
      </div>
    </section>
    <section><div className="mb-8 max-w-xl"><p className="eyebrow">A thoughtful learning loop</p><h2 className="text-3xl font-bold sm:text-4xl">Less friction. More understanding.</h2></div>
      <div className="grid gap-5 md:grid-cols-3">{[
        ['01', 'code', 'Make practice a habit', 'Explore problems by topic and difficulty. Write code in the language that feels right for you.'],
        ['02', 'check', 'Understand your results', 'See which tests passed, then use AI feedback to strengthen your reasoning and code.'],
        ['03', 'chat', 'Get unstuck, together', 'Ask a programming question. Your teacher reviews every answer before it reaches you.'],
      ].map(([step, icon, title, body]) => <article className="card" key={step}><div className="mb-6 flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon name={icon} /></span><span className="font-mono text-xs text-slate-400">{step}</span></div><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">{body}</p></article>)}</div>
    </section>
    <section className="flex flex-col justify-between gap-6 rounded-3xl bg-[#151c36] p-7 text-white sm:p-10 md:flex-row md:items-center"><div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">For students and teachers</p><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">One workspace. Shared progress.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Build your problem library, support your students, and celebrate the small wins that add up.</p></div><Link className="btn shrink-0" to="/register">Create your account <Icon name="arrow" className="h-4 w-4" /></Link></section>
    <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"><span>© {new Date().getFullYear()} CodeGrade</span><span>A focused place to learn and teach code.</span></footer>
  </div>;
}
