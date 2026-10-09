import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const paths = {
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  chat: 'M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5A8.5 8.5 0 1 1 21 11.5Z',
  check: 'm5 12 4 4L19 6',
  book: 'M4 3h6a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H4Zm9 3a3 3 0 0 1 3-3h5v15h-5a3 3 0 0 0-3 3',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  upload: 'M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  search: 'M21 21l-5-5M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  clock: 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0',
  trophy: 'M8 3h8v6a4 4 0 0 1-8 0Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v6m-4 2h8',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10',
};
export function Icon({ name = 'code', className = 'h-5 w-5' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={paths[name] || paths.code} /></svg>;
}
export function PageHeader({ eyebrow = 'Workspace', title, description, action, backTo, backLabel = 'Back' }) {
  useEffect(() => { document.title = `${title} · CodeGrade`; }, [title]);
  return <header className="page-header">
    <div className="min-w-0">
      {backTo && <Link to={backTo} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400"><span aria-hidden="true">←</span>{backLabel}</Link>}
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
    {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
  </header>;
}
export function EmptyState({ icon = 'book', title, description, action }) {
  return <div className="empty-state">
    <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon name={icon} /></span>
    <h3 className="text-base font-semibold">{title}</h3>
    {description && <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>;
}
export function ErrorState({ message, onRetry }) {
  return <div role="alert" className="error-state"><p>{message}</p>{onRetry && <button type="button" className="btn-secondary mt-3" onClick={onRetry}>Try again</button>}</div>;
}
export function StatusBadge({ status }) {
  const cls = ['graded', 'completed', 'approved', 'easy'].includes(status) ? 'badge-success' : ['failed', 'error', 'rejected', 'hard'].includes(status) ? 'badge-danger' : ['queued', 'pending', 'running', 'medium'].includes(status) ? 'badge-warning' : '';
  return <span className={`badge capitalize ${cls}`}>{status}</span>;
}
