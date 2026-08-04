import { TOPICS } from '../data/topics.js';

/**
 * Multi-select chip filter over the fixed topic list. `selected` is an array
 * of topic strings; clicking a chip toggles it in/out. `counts` (optional)
 * is { [topic]: number } shown alongside each chip.
 */
export default function TopicFilter({ selected, onChange, counts, clearLabel = 'Clear filters' }) {
  function toggle(topic) {
    onChange(
      selected.includes(topic) ? selected.filter((t) => t !== topic) : [...selected, topic]
    );
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {TOPICS.map((topic) => {
          const active = selected.includes(topic);
          const count = counts?.[topic];
          return (
            <button
              key={topic}
              type="button"
              onClick={() => toggle(topic)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                  : 'border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500'
              }`}
            >
              {topic}
              {typeof count === 'number' && (
                <span className={active ? 'opacity-80' : 'text-slate-400 dark:text-slate-500'}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="btn-ghost btn-sm !py-1 text-xs"
          >
            {clearLabel}
          </button>
        )}
      </div>
    </div>
  );
}
