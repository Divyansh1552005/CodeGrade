import Doubt from '../models/Doubt.js';
import Problem from '../models/Problem.js';
import Answer from '../models/Answer.js';
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

export const OFF_TOPIC_REASON = 'This does not look like a question about programming.';

// "Marked off topic" for an unrelated doubt; spam and abuse are described as removed.
export const removalTitle = (doubt) => (doubt.triage?.verdict === 'spam_or_abusive' ? 'Your doubt was removed' : 'Your doubt was marked off topic');

export const TEACHER_OFF_TOPIC_REASON = 'A teacher marked this doubt as not about programming.';

export async function notifyRemoval(doubt) {
  // A teacher's decision gets its own key: a doubt can be removed by the AI, appealed, and then
  // removed again by a teacher, and the student must be told both times.
  const byTeacher = doubt.triage?.source === 'teacher';
  await createNotification({
    key: byTeacher ? `doubt-teacher-removed-${doubt.id}-${new Date(doubt.triage.decidedAt).getTime()}` : `doubt-removed-${doubt.id}`,
    userId: doubt.studentId, type: 'doubt_removed',
    title: byTeacher ? 'A teacher marked your doubt off topic' : removalTitle(doubt),
    body: doubt.triage?.reason || OFF_TOPIC_REASON,
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

/**
 * The draft model said the doubt is not about programming. The doubt is removed like any other
 * auto-removed doubt: hidden from the board and from teachers, the student is notified and may
 * appeal once. Returns the updated doubt, or null when it was already decided, appealed, or a
 * teacher has answered it in the meantime.
 */
export async function removeAsOffTopic(doubt) {
  if (await Answer.exists({ doubtId: doubt.id })) return null;
  const triage = { verdict: 'unrelated', reason: OFF_TOPIC_REASON, model: getModelName(), source: 'ai', lowConfidence: false, decidedAt: new Date() };
  const removed = await Doubt.findOneAndUpdate(
    { _id: doubt.id, status: { $nin: ['auto_rejected', 'appealed', 'pending_triage'] } },
    { $set: { status: 'auto_rejected', triage, aiDraftStatus: 'irrelevant' } },
    { new: true }
  );
  if (removed) await notifyRemoval(removed);
  return removed;
}

const plainReason = (text) => String(text ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, aiLimits().triage.reasonMaxChars);

/**
 * A teacher marks a doubt off topic (usually while answering by hand). It is removed like any other
 * removed doubt: hidden from the board and the other teachers, the student is told and may appeal
 * once. If the student already used their appeal they cannot appeal again: the appeal record stays.
 * Returns { doubt }, or { error: 'answered' } when it already has an approved answer, or
 * { error: 'unavailable' } when it is already removed or still being checked.
 */
export async function markOffTopicByTeacher(doubtId, teacher, reason) {
  if (await Answer.exists({ doubtId, state: 'approved' })) return { error: 'answered' };
  const triage = {
    verdict: 'unrelated', reason: plainReason(reason) || TEACHER_OFF_TOPIC_REASON, source: 'teacher',
    decidedBy: teacher._id, lowConfidence: false, decidedAt: new Date(),
  };
  const removed = await Doubt.findOneAndUpdate(
    { _id: doubtId, status: { $nin: ['auto_rejected', 'pending_triage'] } },
    { $set: { status: 'auto_rejected', triage, aiDraftStatus: 'irrelevant' }, $unset: { removalNotifiedAt: '' } },
    { new: true }
  );
  if (!removed) return { error: 'unavailable' };
  // Any AI draft still waiting for review is moot now.
  for (const draft of await Answer.find({ doubtId, state: 'pending' })) {
    draft.state = 'rejected';
    draft.reviewedBy = teacher._id;
    draft.reviewedAt = new Date();
    draft.reviewNotes = 'The doubt was marked off topic.';
    await draft.save();
  }
  await notifyRemoval(removed);
  return { doubt: removed };
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
