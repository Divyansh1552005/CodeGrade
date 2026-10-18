import { ErrorState, TableSkeleton } from './ui/index.js';
import PagerControls from './PagerControls.jsx';
import { cn } from '../lib/cn.js';

const PAGE_SIZE = 10;

/**
 * A heading, a paged table and its controls, with the loading, empty and error states for one list.
 * The table keeps its height (header plus ten rows) while there is more than one page, and the rows of
 * the current page stay on screen, dimmed, while the next page loads, so the page never jumps.
 * `children(items)` renders the table for the current rows.
 */
export default function PagedSection({ id, heading, label, list, empty, skeletonColumns = 4, hideHeading = false, children }) {
  const paged = !list.isFirstPage || list.hasMore;
  const hasRows = list.items.length > 0;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={hideHeading ? 'sr-only' : 'mb-2 text-md font-semibold'}>{heading}</h2>
      <p role="status" className="sr-only">{list.fetching ? `Loading ${label}` : ''}</p>
      {list.error && <ErrorState className="mb-3" message={list.error} onRetry={list.retry} />}
      {list.loading && !list.error && <TableSkeleton rows={PAGE_SIZE} columns={skeletonColumns} />}
      {!list.loading && !list.error && !hasRows && list.isFirstPage && empty}
      {!list.loading && !hasRows && !list.isFirstPage && !list.error && (
        <p className="text-base text-fg-muted">There is nothing on this page. Go back to the newest {label}.</p>
      )}
      {hasRows && (
        <div aria-busy={list.fetching} className={cn('transition-opacity', paged && 'min-h-124', list.fetching && 'opacity-60')}>
          {children(list.items)}
        </div>
      )}
      <PagerControls list={list} label={label} />
    </section>
  );
}
