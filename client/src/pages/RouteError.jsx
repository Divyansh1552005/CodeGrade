import { Button, PageHeader } from '../components/ui/index.js';

export default function RouteError() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-10">
      <div className="w-full">
        <PageHeader title="This page couldn’t load" description="Something interrupted the page. Reload to try again, or go back to the start." />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>Reload page</Button>
          <Button to="/">Go to home</Button>
        </div>
      </div>
    </main>
  );
}
