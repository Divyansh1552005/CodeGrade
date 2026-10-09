import Submission from '../models/Submission.js';
import { gradeSubmission } from './gradingService.js';
import { generateFeedback } from './aiFeedbackChain.js';
import { recordSubmissionTasks } from './workService.js';

export async function processSubmission(job) {
  let submission = await Submission.findById(job.data.submissionId).select('+testCasesSnapshot');
  if (!submission) throw new Error('Submission not found');
  if (submission.status === 'graded') {
    await recordSubmissionTasks(submission);
    return { submissionId: submission.id };
  }
  try {
    const started = await Submission.updateOne({ _id: submission.id, status: { $ne: 'graded' } },
      { $set: { status: 'running' }, $unset: { error: '' } });
    if (!started.matchedCount) {
      await recordSubmissionTasks(await Submission.findById(submission.id));
      return { submissionId: submission.id };
    }
    const graded = await gradeSubmission({ language: submission.language, code: submission.code,
      testCases: submission.testCasesSnapshot ?? job.data.testCases });
    const committed = await Submission.findOneAndUpdate({ _id: submission.id, status: { $ne: 'graded' } },
      { $set: { ...graded, status: 'graded', feedbackStatus: 'pending', gradedAt: new Date() }, $unset: { error: '' } },
      { new: true });
    submission = committed ?? await Submission.findById(submission.id);
  } catch (err) {
    await Submission.updateOne({ _id: submission.id, status: { $ne: 'graded' } },
      { $set: { status: 'error', error: err.message } });
    throw err;
  }
  // Failure here must never overwrite successfully committed test results.
  await recordSubmissionTasks(submission);
  return { submissionId: submission.id };
}

export async function processFeedback(job) {
  const submission = await Submission.findById(job.data.submissionId);
  if (!submission || submission.status !== 'graded') throw new Error('Graded submission not found');
  if (submission.feedbackStatus === 'completed') return;
  const started = await Submission.updateOne({ _id: submission.id, feedbackStatus: { $ne: 'completed' } },
    { $set: { feedbackStatus: 'running' } });
  if (!started.matchedCount) return;
  const aiFeedback = await generateFeedback({ language: submission.language, code: submission.code,
    passCount: submission.passCount, totalCount: submission.totalCount, testResults: submission.testResults });
  await Submission.updateOne({ _id: submission.id, feedbackStatus: { $ne: 'completed' } },
    { $set: { aiFeedback, feedbackStatus: 'completed' }, $unset: { feedbackError: '' } });
}
