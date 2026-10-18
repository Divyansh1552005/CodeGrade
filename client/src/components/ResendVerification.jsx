import { Button, ErrorState } from './ui/index.js';
import { useResendVerification } from '../api/useResendVerification.js';

/** "Resend email" with a visible countdown. `email` is the address to resend to. */
export default function ResendVerification({ email, initialCooldown = 0, label = 'Resend email', className }) {
  const { resend, busy, sent, error, remaining } = useResendVerification(email, { initialCooldown });
  return (
    <div className={className}>
      <Button variant="secondary" className="w-full" loading={busy} disabled={remaining > 0} onClick={resend}>
        {remaining > 0 ? `${label} in ${remaining}s` : label}
      </Button>
      <p role="status" className="mt-2 min-h-5 text-sm text-fg-muted">{sent && !error ? 'If the account can be verified, a new link is on its way.' : ''}</p>
      {error && <ErrorState message={error} />}
    </div>
  );
}
