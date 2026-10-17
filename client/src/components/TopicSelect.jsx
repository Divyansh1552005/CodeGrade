import { ChevronDown, X } from 'lucide-react';
import { TOPICS } from '../data/topics.js';
import { Badge, Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger, Icon } from './ui/index.js';

/**
 * Multi-select over the fixed topic list. A menu of checkboxes (type to jump to a topic),
 * with the selection shown as removable badges.
 */
export default function TopicSelect({ selected, onChange }) {
  function toggle(topic, checked) {
    onChange(checked ? [...selected, topic] : selected.filter((t) => t !== topic));
  }
  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Select topics">
            {selected.length > 0 ? `${selected.length} topic${selected.length > 1 ? 's' : ''} selected` : 'Select topics'}
            <Icon as={ChevronDown} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
          {TOPICS.map((topic) => (
            <DropdownMenuCheckboxItem
              key={topic}
              checked={selected.includes(topic)}
              onCheckedChange={(checked) => toggle(topic, checked)}
              onSelect={(event) => event.preventDefault()}
            >
              {topic}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {selected.length > 0 && (
        <ul aria-label="Selected topics" className="flex flex-wrap gap-2">
          {selected.map((topic) => (
            <li key={topic}>
              <Badge tone="accent" className="h-6 pr-1">
                {topic}
                <button type="button" aria-label={`Remove ${topic}`} className="inline-flex size-4 items-center justify-center rounded-full hover:bg-surface" onClick={() => toggle(topic, false)}>
                  <Icon as={X} className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
