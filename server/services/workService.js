import WorkItem from '../models/WorkItem.js';
import Doubt from '../models/Doubt.js';

// MongoDB is the durable outbox. No Redis/network calls belong in API handlers.
export async function ensureWork({ key, type, ownerId, payload }) {
  try {
    return await WorkItem.findOneAndUpdate({ key }, {
      $setOnInsert: { key, type, ownerId, payload, status: 'pending' },
    }, { upsert: true, new: true, runValidators: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return WorkItem.findOne({ key });
  }
}

export async function recordSubmissionTasks(submission) {
  await ensureWork({ key: `completion-${submission.id}`, type: 'completion',
    ownerId: submission.studentId, payload: { submissionId: submission.id } });
  if (submission.feedbackStatus === 'pending') {
    await ensureWork({ key: `feedback-${submission.id}`, type: 'feedback',
      ownerId: submission.studentId, payload: { submissionId: submission.id } });
  }
  await submission.constructor.updateOne({ _id: submission.id }, { $set: { completionRecordedAt: new Date() } });
}

export async function recordAnswerNotification(answer) {
  if (answer.state !== 'approved') return;
  const doubt = await Doubt.findById(answer.doubtId);
  if (!doubt) return;
  await ensureWork({ key: `answer-notification-${answer.id}`, type: 'notification',
    ownerId: doubt.studentId, payload: { answerId: answer.id } });
  await answer.constructor.updateOne({ _id: answer.id }, { $set: { notificationRecordedAt: new Date() } });
}
