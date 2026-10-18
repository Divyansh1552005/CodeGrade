import { renderEmail } from './layout.js';

export function teacherRejected({ name, reason }) {
  const subject = 'Your teacher application was not approved';
  const paragraphs = [
    `Hi ${name},`,
    'An administrator reviewed your teacher application and did not approve it. Your account stays active, with no access to teacher features.',
    ...(reason ? [`Reason: ${reason}`] : []),
  ];
  const footer = ['If you did not apply for a teacher account, you can ignore this email.'];
  return { subject, link: null, ...renderEmail({ title: 'Your application was not approved', paragraphs, action: null, footer }) };
}
