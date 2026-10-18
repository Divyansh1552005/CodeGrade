import WorkItem from '../models/WorkItem.js';
import Submission from '../models/Submission.js';
import Doubt from '../models/Doubt.js';
import Answer from '../models/Answer.js';
import Problem from '../models/Problem.js';
import { ensureWork, recordSubmissionTasks, recordAnswerNotification } from './workService.js';
import { failWork } from './workProcessor.js';
import { failOpen, notifyRemoval, removeAsOffTopic } from './doubtTriage.js';
import { aiLimits } from '../config/aiLimits.js';
import { retryPolicy } from './workPolicy.js';

// Restore domain-to-outbox crash gaps. Existing work keys preserve failed and
// completed state, so a scan never replenishes an exhausted retry budget.
export async function recoverDomainWork() {
  for await (const submission of Submission.find({ status: { $in: ['queued', 'running'] } }).select('+testCasesSnapshot').cursor()) {
    let testCases = submission.testCasesSnapshot;
    // Compatibility for submissions created before snapshots were introduced.
    if (!testCases) testCases = (await Problem.findById(submission.problemId))?.testCases;
    if (!testCases) {
      await Submission.updateOne({ _id: submission.id, status: { $in: ['queued', 'running'] } },
        { $set: { status: 'error', error: 'Problem test cases are unavailable.' } });
      continue;
    }
    await ensureWork({ key: `grading-${submission.id}`, type: 'grading', ownerId: submission.studentId,
      payload: { submissionId: submission.id, testCases } });
  }
  // Doubts waiting for triage: a recent one gets its triage job back if the process died
  // before queuing it. One stuck past TRIAGE_STUCK_MINUTES fails open to the teachers.
  const stuckBefore = new Date(Date.now() - aiLimits().triage.stuckMinutes * 60 * 1000);
  for await (const doubt of Doubt.find({ status: 'pending_triage' }).cursor()) {
    if (doubt.createdAt < stuckBefore) await failOpen(doubt.id, 'triage_stuck');
    else await ensureWork({ key: `triage-${doubt.id}`, type: 'doubt-triage', ownerId: doubt.studentId, payload: { doubtId: doubt.id } });
  }
  // A removal whose notification was lost in a crash.
  for await (const doubt of Doubt.find({ status: 'auto_rejected', removalNotifiedAt: { $exists: false } }).setOptions({ includeRemoved: true }).cursor()) {
    await notifyRemoval(doubt);
  }
  // Doubts the draft model marked off topic before off-topic doubts were removed: hide them and tell the
  // student, unless a teacher has already answered. Appealed doubts are never touched.
  for await (const doubt of Doubt.find({ aiDraftStatus: 'irrelevant', status: { $nin: ['auto_rejected', 'appealed'] } }).cursor()) {
    await removeAsOffTopic(doubt);
  }
  for await (const doubt of Doubt.find({ aiDraftStatus: 'pending', status: { $ne: 'pending_triage' } }).cursor()) {
    await ensureWork({ key: `draft-${doubt.id}`, type: 'doubt-draft', ownerId: doubt.studentId, payload: { doubtId: doubt.id } });
  }
  for await (const submission of Submission.find({ status: 'graded', completionRecordedAt: { $exists: false } }).cursor()) {
    await recordSubmissionTasks(submission);
  }
  for await (const submission of Submission.find({ status: 'graded', feedbackStatus: { $in: ['pending', 'running'] } }).cursor()) {
    await ensureWork({ key: `feedback-${submission.id}`, type: 'feedback', ownerId: submission.studentId, payload: { submissionId: submission.id } });
  }
  // Phase 2 backfill also covers completion jobs that finished before awards existed.
  for await (const submission of Submission.find({ status: 'graded', gamificationRecordedAt: { $exists: false } }).cursor()) {
    await ensureWork({ key: `gamification-${submission.id}`, type: 'completion', ownerId: submission.studentId, payload: { submissionId: submission.id } });
  }
  for await (const answer of Answer.find({ state: 'approved', notificationRecordedAt: { $exists: false } }).cursor()) {
    await recordAnswerNotification(answer);
  }
}

export async function dispatchWork(work, queue) {
  const existing = await queue.getJob(work.id);
  if (existing) {
    const state = await existing.getState();
    if (state === 'failed') await failWork(work, new Error(existing.failedReason || 'Job failed'));
    // Never duplicate an active, waiting, delayed, or completed job.
    return;
  }
  const policy = retryPolicy(work.type);
  if (work.attempts >= policy.attempts) {
    await failWork(work, new Error(work.error || 'Job retry budget exhausted'));
    return;
  }
  await queue.add(work.type, { workItemId: work.id }, {
    jobId: work.id, attempts: Math.max(1, policy.attempts - work.attempts), backoff: { type: 'exponential', delay: policy.delay },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800, count: 1000 },
  });
  // The consumer may already have started; never overwrite its status.
  await WorkItem.updateOne({ _id: work.id, status: 'pending' }, { $set: { status: 'queued' } });
}

export async function dispatchPendingWork(queues) {
  // Bounded dispatch batches. Old queued/running rows are inspected in the
  // slower reconciliation scan, rather than occupying every dispatcher batch.
  const work = await WorkItem.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(100);
  for (const item of work) await dispatchWork(item, queues[item.type]);
}

export async function reconcileWork(queues) {
  await recoverDomainWork();
  for await (const work of WorkItem.find({ status: { $in: ['pending', 'queued', 'running'] } }).cursor()) {
    await dispatchWork(work, queues[work.type]);
  }
}
