import Doubt from '../../models/Doubt.js';
import WorkItem from '../../models/WorkItem.js';
import { ensureDraftWork } from '../../services/doubtTriage.js';

/**
 * A new doubt waits in pending_triage and only gets a draft job once triage lets it through. For tests that are
 * about the draft, not triage: settle triage as "passed" (the way a programming question would) and return the
 * draft work item.
 */
export async function draftWork(doubtId) {
  const doubt = await Doubt.findOneAndUpdate(
    { _id: doubtId, status: 'pending_triage' },
    { $set: { status: 'pending_review', triage: { verdict: 'programming', confidence: 0.99, source: 'ai', lowConfidence: false, decidedAt: new Date() } } },
    { new: true },
  );
  if (doubt) await ensureDraftWork(doubt);
  return WorkItem.findOne({ key: `draft-${doubtId}` });
}
