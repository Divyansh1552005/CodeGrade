import { useState } from 'react';
import { Button, Modal } from './ui/index.js';

const STORAGE_KEY = 'coldstart-notice-dismissed';
const RENDER_URL = 'https://codegrade.onrender.com';

/**
 * One-per-session heads-up that the backend is on Render's free tier and may
 * need a manual cold-start visit. Gated on sessionStorage (not localStorage)
 * so it reappears in a fresh tab/session but not on every page navigation
 * within the same visit.
 */
export default function ColdStartNotice() {
  const [open, setOpen] = useState(() => !sessionStorage.getItem(STORAGE_KEY));

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && dismiss()}
      title="Waking up the server"
      className="max-w-md"
      footer={<>
        <Button onClick={dismiss}>Dismiss</Button>
        <Button variant="primary" href={RENDER_URL} target="_blank" rel="noopener noreferrer">Cold-start the backend</Button>
      </>}
    >
      <div className="space-y-3 text-base text-fg-muted">
        <p>
          This site's backend runs on Render's free tier, which spins down after a period of inactivity.
          If things feel slow or a login fails on the first try, open the link below in a new tab to
          cold-start it (about 30 to 60 seconds), then come back here and try again.
        </p>
        <p>
          When it wakes up, the tab shows <code className="rounded-sm border border-border bg-subtle px-1 text-sm">{'{"error":"Not found"}'}</code>.
          That is expected: the backend is an API with no page at its root URL, so this response confirms the server is awake.
        </p>
      </div>
    </Modal>
  );
}
