import { renderEmail } from './layout.js';

export function teacherApproved({ name, link }) {
  const subject = 'Your teacher account was approved';
  const paragraphs = [`Hi ${name},`, 'An administrator approved your teacher account. Log in again to start using it.'];
  const footer = ['If you did not apply for a teacher account, you can ignore this email.'];
  return { subject, link, ...renderEmail({ title: 'Your teacher account was approved', paragraphs, action: { label: 'Log in', link }, footer }) };
}
