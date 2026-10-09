import { Link } from 'react-router-dom';
import { PageHeader, Icon } from '../components/UI.jsx';

export default function RouteError() {
  return <main className="flex min-h-screen items-center justify-center px-4 py-10"><div className="card w-full max-w-xl !p-8">
    <span className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"><Icon name="clock" /></span>
    <PageHeader eyebrow="Let’s try that again" title="This page couldn’t load" description="Something interrupted this page. Reload to try again, or head back to the start." />
    <div className="flex flex-wrap gap-3"><button className="btn" onClick={() => window.location.reload()}>Reload page</button><Link className="btn-secondary" to="/">Back to home</Link></div>
  </div></main>;
}
