import AuthCard from './AuthCard.jsx';
import ResendVerification from './ResendVerification.jsx';
import { RESEND_COOLDOWN_SECONDS } from '../api/useResendVerification.js';

/** Shown after signup when email verification is on. The email was just sent, so the cooldown starts running. */
export default function CheckInbox({ email, onUseDifferentEmail }) {
  return (
    <AuthCard
      title="Check your inbox"
      subtitle={<>We sent a verification link to <span className="font-medium text-fg">{email}</span>.</>}
      footer={<button type="button" onClick={onUseDifferentEmail} className="rounded-sm font-medium text-accent-text hover:underline">Use a different email</button>}
    >
      <p className="mb-4 text-base text-fg-muted">Open the link to finish creating your account. It can take a minute to arrive. Check your spam folder if you do not see it.</p>
      <ResendVerification email={email} initialCooldown={RESEND_COOLDOWN_SECONDS} />
    </AuthCard>
  );
}
