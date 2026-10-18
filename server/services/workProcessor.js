import WorkItem from '../models/WorkItem.js';
import Submission from '../models/Submission.js';
import Doubt from '../models/Doubt.js';
import { processSubmission, processFeedback } from './submissionProcessor.js';
import { processDoubtDraft } from './doubtProcessor.js';
import { processDoubtTriage, failOpen } from './doubtTriage.js';
import { processCompletion } from './progressService.js';
import { processNotification } from './notificationProcessor.js';
import { processBulk } from './bulkProcessor.js';

export async function failWork(work, error) {
  const message = error?.message || String(error);
  await WorkItem.updateOne({ _id: work.id, status: { $ne: 'completed' } },
    { $set: { status: 'failed', error: message, finishedAt: new Date() } });
  if (work.type === 'grading') {
    await Submission.updateOne({ _id: work.payload.submissionId, status: { $ne: 'graded' } },
      { $set: { status: 'error', error: message } });
  } else if (work.type === 'feedback') {
    await Submission.updateOne({ _id: work.payload.submissionId, feedbackStatus: { $ne: 'completed' } },
      { $set: { feedbackStatus: 'failed', feedbackError: message } });
  } else if (work.type === 'doubt-triage') {
    // Triage could not finish: the doubt goes to the teachers rather than waiting forever.
    await failOpen(work.payload.doubtId, 'triage_failed');
  } else if (work.type === 'doubt-draft') {
    await Doubt.updateOne({ _id: work.payload.doubtId, aiDraftStatus: { $nin: ['success', 'irrelevant'] } },
      { $set: { aiDraftStatus: 'failed', aiDraftError: message } });
  }
}

export async function processWork(job) {
  const work = await WorkItem.findById(job.data.workItemId);
  if (!work) throw new Error('Work item not found');
  if (work.status === 'completed') return work.result;
  if (work.attempts >= 3) {
    const err = new Error('Job retry budget exhausted');
    await failWork(work, err);
    throw err;
  }
  const started = await WorkItem.updateOne({ _id: work.id, status: { $ne: 'completed' } },
    { $set: { status: 'running' }, $inc: { attempts: 1 }, $unset: { error: '' } });
  if (!started.matchedCount) return (await WorkItem.findById(work.id))?.result;
  try {
    const input = { data: work.payload };
    let result;
    switch (work.type) {
      case 'grading': result = await processSubmission(input); break;
      case 'feedback': result = await processFeedback(input); break;
      case 'doubt-triage': result = await processDoubtTriage(input); break;
      case 'doubt-draft': result = await processDoubtDraft(input); break;
      case 'completion': result = await processCompletion(input); break;
      case 'notification': result = await processNotification(input); break;
      default: result = await processBulk(work);
    }
    await WorkItem.updateOne({ _id: work.id, status: { $ne: 'completed' } }, { $set: { status: 'completed', result: result ?? {}, finishedAt: new Date() }, $unset: { error: '' } });
    return result ?? {};
  } catch (err) {
    if (job.attemptsMade + 1 >= (job.opts?.attempts ?? 3)) await failWork(work, err);
    else await WorkItem.updateOne({ _id: work.id, status: { $ne: 'completed' } }, { $set: { status: 'queued', error: err.message } });
    throw err;
  }
}
