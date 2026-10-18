import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Icon } from './ui/index.js';

/**
 * Older / Newer buttons and a Newest button for a list from usePagedList. `label` names what is paged
 * ("submissions"), so each button has an accessible name that says which list it moves. Everything is
 * disabled while a page is loading.
 */
export default function PagerControls({ list, label }) {
  if (list.isFirstPage && !list.hasMore) return null;
  return (
    <nav aria-label={`${label} pages`} className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        {!list.isFirstPage && (
          <Button variant="ghost" size="sm" disabled={!list.canNewest} onClick={list.goNewest} aria-label={`Back to the newest ${label}`}>Newest</Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!list.canNewer} onClick={list.goNewer} aria-label={`Newer ${label}`}><Icon as={ChevronLeft} />Newer</Button>
        <Button size="sm" disabled={!list.canOlder} onClick={list.goOlder} aria-label={`Older ${label}`}>Older<Icon as={ChevronRight} /></Button>
      </div>
    </nav>
  );
}
