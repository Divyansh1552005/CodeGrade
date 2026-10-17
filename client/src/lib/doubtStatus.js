/** Display status for a doubt: label plus Badge tone. */
export function doubtStatus(doubt) {
  if (doubt.hasApprovedAnswer) return { label: 'Answered', tone: 'success' };
  if (doubt.aiDraftStatus === 'irrelevant') return { label: 'Off topic', tone: 'neutral' };
  if (doubt.aiDraftStatus === 'failed') return { label: 'Awaiting teacher', tone: 'warning' };
  return { label: 'Awaiting review', tone: 'info' };
}
