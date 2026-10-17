/** Collapses a submission into one display status: queued, running, error, accepted or failed. */
export function verdictOf(submission) {
  if (['queued', 'running', 'error'].includes(submission.status)) return submission.status;
  return submission.totalCount > 0 && submission.passCount === submission.totalCount ? 'accepted' : 'failed';
}
