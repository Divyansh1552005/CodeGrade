import { useEffect } from 'react';
import { Icon } from './UI.jsx';

export default function AuthCard({ title, subtitle, children }) {
  useEffect(() => { document.title = `${title} · CodeGrade`; }, [title]);
  return <div className="mx-auto grid min-h-[72vh] max-w-5xl items-center gap-10 py-5 lg:grid-cols-2 lg:gap-16">
    <section className="hidden rounded-3xl bg-[#151c36] p-10 text-white lg:block">
      <span className="mb-10 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500"><Icon name="code" /></span>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Learn with intention</p>
      <h2 className="mt-4 text-4xl font-bold leading-tight">Your next breakthrough starts here.</h2>
      <p className="mt-5 text-sm leading-7 text-slate-300">A focused space to practice, understand your mistakes, and build confidence with every solution.</p>
      <div className="mt-10 space-y-5">{[
        ['code', 'Practice that makes progress', 'Work through problems in your preferred language.'],
        ['check', 'Feedback you can act on', 'Understand test results and improve your approach.'],
        ['chat', 'Support when you need it', 'Get answers reviewed by your teachers.'],
      ].map(([icon, heading, copy]) => <div key={heading} className="flex gap-4"><span className="mt-1 text-indigo-300"><Icon name={icon} /></span><div><p className="text-sm font-semibold">{heading}</p><p className="mt-1 text-xs leading-5 text-slate-400">{copy}</p></div></div>)}</div>
    </section>
    <section className="card mx-auto w-full max-w-md !p-7 sm:!p-9">
      <p className="eyebrow">Your CodeGrade account</p>
      <h1 className="mt-3 text-3xl font-bold">{title}</h1>
      {subtitle && <p className="mt-3 mb-8 text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>}
      {children}
    </section>
  </div>;
}
