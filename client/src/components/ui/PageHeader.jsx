import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Icon } from './Icon.jsx';

export function PageHeader({ title, description, action, backTo, backLabel = 'Back' }) {
  useEffect(() => { document.title = `${title} - CodeGrade`; }, [title]);
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {backTo && (
          <Link to={backTo} className="mb-2 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
            <Icon as={ArrowLeft} />{backLabel}
          </Link>
        )}
        <h1 className="break-words text-xl font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-base text-fg-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
