import { renderEmail } from './layout.js';

export function accountExists({ name }) {
  const subject = 'You already have a CodeGrade account';
  const paragraphs = [
    `Hi ${name},`,
    'Someone tried to sign up for CodeGrade with this email address, but an account already exists for it.',
    'You can log in as usual. If you forgot your password, use "Forgot password" on the log in page.',
  ];
  const footer = ['If you did not try to sign up, you can ignore this email. Nothing about your account has changed.'];
  return { subject, link: null, ...renderEmail({ title: 'You already have an account', paragraphs, action: null, footer }) };
}
