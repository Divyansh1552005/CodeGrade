import Doubt from '../models/Doubt.js';
import Problem from '../models/Problem.js';
import { classifyDoubt } from './doubtTriageChain.js';
import { getModelName } from './llm.js';
import { ensureWork } from './workService.js';
import { createNotification } from './notificationService.js';
import { aiLimits } from '../config/aiLimits.js';
import { logger } from '../utils/logger.js';

export const REJECT_VERDICTS = ['unrelated', 'spam_or_abusive'];

/**
 * Turn a classifier outcome into a moderation decision. Only a confident "unrelated" or
 * "spam_or_abusive" removes a doubt. Everything else, including errors, goes to the
 * teachers (fail open).
 */
export function decide(outcome, { threshold = aiLimits().triage.rejectThreshold, model = getModelName(), now = new Date() } = {}) {
  if (!outcome?.result) {
    return { status: 'pending_review', triage: { source: 'fallback', error: outcome?.error || 'ai_error', lowConfidence: true, model, decidedAt: now } };
  }
  const { verdict, confidence, reason } = outcome.result;
  const rejectVerdict = REJECT_VERDICTS.includes(verdict);
  const reject = rejectVerdict && confidence >= threshold;
  return {
    status: reject ? 'auto_rejected' : 'pending_review',
    triage: { verdict, confidence, reason, model, source: 'ai', lowConfidence: rejectVerdict && !reject, decidedAt: now },
  };
}

export const ensureDraftWork = (doubt) => ensureWork({
  key: `draft-${doubt.id}`, type: 'doubt-draft', ownerId: doubt.studentId, payload: { doubtId: doubt.id },
});

export async function notifyRemoval(doubt) {
  await createNotification({
    key: `doubt-removed-${doubt.id}`, userId: doubt.studentId, type: 'doubt_removed',
    title: 'Your doubt was removed', body: doubt.triage?.reason || 'It did not look like a question about programming.',
    link: `/doubts/${doubt.id}/removed`,
  });
  await Doubt.updateOne({ _id: doubt.id }, { $set: { removalNotifiedAt: new Date() } });
}

// Move a doubt out of pending_triage exactly once. Returns the updated doubt, or null
// when another worker (or the stuck-doubt safeguard) already decided it.
async function settle(doubtId, { status, triage }) {
  return Doubt.findOneAndUpdate({ _id: doubtId, status: 'pending_triage' }, { $set: { status, triage } }, { new: true });
}

/** Apply the side effects of a decision: a notification for a removal, a draft job otherwise. */
export async function afterDecision(doubt) {
  if (doubt.status === 'auto_rejected') await notifyRemoval(doubt);
  else await ensureDraftWork(doubt);
}

/** Fail open: the doubt goes to the teachers. Used when triage cannot complete. */
export async function failOpen(doubtId, error) {
  const decision = decide({ error }, {});
  const doubt = await settle(doubtId, decision);
  if (doubt) await afterDecision(doubt);
  return doubt;
}

/**
 * Background job. Idempotent: a doubt is decided once, and a repeat run does nothing.
 * AI problems never throw (fail open, no retry); only database errors do, so BullMQ retries them.
 */
export async function processDoubtTriage(job) {
  const log = logger.child({ requestId: job.data.requestId, doubtId: job.data.doubtId });
  const doubt = await Doubt.findOne({ _id: job.data.doubtId, status: 'pending_triage' }).setOptions({ includeRemoved: true });
  if (!doubt) return { skipped: true };

  const problem = doubt.problemId
    ? await Problem.findOne({ _id: doubt.problemId, archived: { $ne: true } }).select('title description topics').lean()
    : null;

  const started = Date.now();
  let outcome;
  try {
    outcome = await classifyDoubt({ problem, title: doubt.title, body: doubt.body, code: doubt.code });
  } catch (err) {
    outcome = { error: 'ai_error' };
  }
  const decision = decide(outcome);
  const settled = await settle(doubt.id, decision);
  if (!settled) return { skipped: true };
  await afterDecision(settled);
  log.info('doubt.triage.decided', {
    status: settled.status, verdict: decision.triage.verdict, confidence: decision.triage.confidence,
    source: decision.triage.source, error: decision.triage.error, durationMs: Date.now() - started,
    bodyLength: doubt.body.length, hasCode: Boolean(doubt.code),
  });
  return { status: settled.status };
}
