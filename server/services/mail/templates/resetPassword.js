import { formatDuration, renderEmail } from './layout.js';

export function resetPassword({ name, link, expiresInMs }) {
  const subject = 'Reset your CodeGrade password';
  const paragraphs = [
    `Hi ${name},`,
    'We received a request to reset the password for your account.',
    `This link expires in ${formatDuration(expiresInMs)} and can be used once.`,
  ];
  const footer = ['If you did not request this, you can ignore this email. Your password will not change.'];
  return { subject, link, ...renderEmail({ title: 'Reset your password', paragraphs, action: { label: 'Reset password', link }, footer }) };
}
