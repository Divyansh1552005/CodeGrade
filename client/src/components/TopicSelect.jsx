import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TOPICS } from '../data/topics.js';

/**
 * Searchable multi-select dropdown over the fixed topic list. Selected topics
 * show as removable chips above the trigger; opening the dropdown reveals a
 * search box and a checkbox list so a teacher can quickly find topics in the
 * full 20+ item list rather than scanning a wall of chips.
 */
export default function TopicSelect({ selected, onChange, placeholder = 'Search topics…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(
    () => TOPICS.filter((t) => t.toLowerCase().includes(query.trim().toLowerCase())),
    [query]
  );

  function toggle(topic) {
    onChange(
      selected.includes(topic) ? selected.filter((t) => t !== topic) : [...selected, topic]
    );
  }

  function remove(topic) {
    onChange(selected.filter((t) => t !== topic));
  }

  return (
    <div ref={rootRef} className="relative">
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((topic) => (
            <span
              key={topic}
              className="inline-flex items-center gap-1 rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-medium text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
            >
              {topic}
              <button
                type="button"
                onClick={() => remove(topic)}
                aria-label={`Remove ${topic}`}
                className="opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex w-full items-center justify-between text-left text-sm text-slate-500 dark:text-slate-400"
      >
        {selected.length > 0
          ? `${selected.length} topic${selected.length > 1 ? 's' : ''} selected`
          : 'Select topics…'}
        <span className={`transition ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full border-b border-slate-200 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">
                  No matching topics.
                </p>
              )}
              {filtered.map((topic) => {
                const active = selected.includes(topic);
                return (
                  <label
                    key={topic}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggle(topic)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    {topic}
                  </label>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
