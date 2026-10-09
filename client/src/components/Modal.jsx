import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

export default function Modal({ open, onClose, title, children, footer, busy = false }) {
  const panel = useRef(null);
  const close = useRef(onClose);
  const blocked = useRef(busy);
  close.current = onClose; blocked.current = busy;
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const wasInert = root?.hasAttribute('inert');
    root?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    const focusables = () => [...(panel.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
    (focusables()[0] || panel.current)?.focus();
    function onKey(event) {
      if (event.key === 'Escape' && !blocked.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      if (!nodes.length) { event.preventDefault(); panel.current?.focus(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (!wasInert) root?.removeAttribute('inert');
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);
  return createPortal(<AnimatePresence>{open && <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : 'Dialog'} aria-describedby={descriptionId} className="card max-h-[85vh] w-full max-w-md overflow-y-auto !p-7 outline-none" initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18 }}>
      {title && <h2 id={titleId} className="mb-3 text-xl font-semibold">{title}</h2>}
      <div id={descriptionId} className="text-sm leading-6 text-slate-500 dark:text-slate-400">{children}</div>
      {footer && <div className="mt-7 flex flex-wrap justify-end gap-2">{footer}</div>}
    </motion.div>
  </motion.div>}</AnimatePresence>, document.body);
}
