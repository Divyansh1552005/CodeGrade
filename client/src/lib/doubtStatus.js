/**
 * Display status for a doubt: label plus Badge tone. `role` is the viewer's role. Only
 * teachers see "Appealed"; a student only ever sees their own doubt as "Checking" while
 * the server is deciding whether it is relevant.
 */
export function doubtStatus(doubt, role = 'student') {
  if (doubt.status === 'pending_triage') return { label: 'Checking', tone: 'info' };
  if (doubt.hasApprovedAnswer) return { label: 'Answered', tone: 'success' };
  if (role === 'teacher' && doubt.status === 'appealed') return { label: 'Appealed', tone: 'warning' };
  if (doubt.aiDraftStatus === 'irrelevant') return { label: 'Off topic', tone: 'neutral' };
  if (doubt.aiDraftStatus === 'failed' || doubt.aiDraftStatus === 'skipped') return { label: 'Awaiting teacher', tone: 'warning' };
  return { label: 'Awaiting review', tone: 'info' };
}
