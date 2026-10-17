import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { cn } from '../../lib/cn.js';

// Layout sizes are remembered per group id. Storage can be unavailable (private mode), so never throw.
const storage = {
  getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
  setItem(key, value) { try { localStorage.setItem(key, value); } catch { /* sizes just won't persist */ } },
};

/** Resizable group whose pane sizes persist between visits. `panelIds` must match the Panel ids inside. */
export function ResizableGroup({ id, orientation = 'horizontal', panelIds, className, children }) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id, panelIds, storage });
  return (
    <Group id={id} orientation={orientation} defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} className={className}>
      {children}
    </Group>
  );
}

export const ResizablePanel = Panel;

/** Thin gutter between panes; the line shows on hover, drag and keyboard focus. */
export function ResizeHandle({ orientation = 'horizontal', className }) {
  const vertical = orientation === 'vertical';
  return (
    <Separator
      className={cn(
        'group relative shrink-0 outline-none',
        vertical ? 'h-3' : 'w-3',
        className
      )}
    >
      <span
        className={cn(
          'absolute rounded-full bg-transparent transition-colors group-data-[separator=hover]:bg-border-strong group-data-[separator=active]:bg-accent group-focus-visible:bg-accent',
          vertical ? 'inset-x-0 top-1/2 h-0.5 -translate-y-1/2' : 'inset-y-0 left-1/2 w-0.5 -translate-x-1/2'
        )}
      />
    </Separator>
  );
}
