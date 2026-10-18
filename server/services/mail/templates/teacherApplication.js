import { renderEmail } from './layout.js';

/** To the admin: a verified applicant is waiting. The applicant's words are shown as plain, escaped text. */
export function teacherApplication({ name, applicant, link }) {
  const subject = 'New teacher application';
  const note = applicant.note ? applicant.note.slice(0, 200) : '';
  const paragraphs = [
    `Hi ${name},`,
    `${applicant.name} (${applicant.email}) applied for a teacher account and has verified their email.`,
    `Organization: ${applicant.organization}`,
    ...(note ? [`Note: ${note}${applicant.note.length > 200 ? '...' : ''}`] : []),
  ];
  const footer = ['You receive at most a few of these emails an hour. The applications page lists every one waiting.'];
  return { subject, link, ...renderEmail({ title: 'New teacher application', paragraphs, action: { label: 'Review applications', link }, footer }) };
}
