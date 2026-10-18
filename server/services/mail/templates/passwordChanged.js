import { renderEmail } from './layout.js';

export function passwordChanged({ name }) {
  const subject = 'Your CodeGrade password was changed';
  const paragraphs = [
    `Hi ${name},`,
    'The password for your account was just changed, and every device was signed out.',
    'If this was you, no action is needed.',
    'If it was not, use "Forgot password" on the log in page to set a new password right away.',
  ];
  const footer = ['This is a security notice. It does not contain a link.'];
  return { subject, link: null, ...renderEmail({ title: 'Your password was changed', paragraphs, action: null, footer }) };
}
