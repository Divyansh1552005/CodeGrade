import { Award } from 'lucide-react';
import { Icon, Panel, PanelBody, PanelHeader } from '../ui/index.js';

/** Earned badges. Icons come from one set; the server's emoji field is not rendered. */
export default function Badges({ badges }) {
  return (
    <Panel aria-label="Badges">
      <PanelHeader title="Badges" />
      <PanelBody>
        {badges?.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {badges.map((badge) => (
              <li key={badge.key} title={badge.description} className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-base">
                <Icon as={Award} className="text-accent-text" />
                <span className="min-w-0 truncate">{badge.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-fg-muted">Your first solve unlocks your first badge.</p>
        )}
      </PanelBody>
    </Panel>
  );
}
