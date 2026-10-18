import { formatDuration, renderEmail } from './layout.js';

/** `resubmitted`: the address already had an unverified signup that a new request has just replaced. */
export function verifyEmail({ name, link, expiresInMs, resubmitted = false }) {
  const subject = 'Verify your email for CodeGrade';
  const paragraphs = [
    `Hi ${name},`,
    resubmitted
      ? 'A new signup request was submitted for this email address. It replaces any earlier request, so only the link in this email will work.'
      : 'Thanks for signing up. Confirm this email address to finish creating your account.',
    `This link expires in ${formatDuration(expiresInMs)} and can be used once.`,
  ];
  const footer = ['If you did not request this, you can ignore this email. No account is activated until the link is used.'];
  return { subject, link, ...renderEmail({ title: 'Verify your email', paragraphs, action: { label: 'Verify email', link }, footer }) };
}
