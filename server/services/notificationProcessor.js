import Notification from '../models/Notification.js';
import Answer from '../models/Answer.js';
import Doubt from '../models/Doubt.js';

export async function processNotification(job) {
  let values;
  // Retire grading notifications already queued by an older worker release.
  if (job.data.submissionId) return;
  if (job.data.answerId) {
    const answer = await Answer.findById(job.data.answerId);
    if (!answer || answer.state !== 'approved') return;
    const doubt = await Doubt.findById(answer.doubtId);
    if (!doubt) return;
    values = { key: `answer-${answer.id}`, userId: doubt.studentId,
      message: `Your doubt “${doubt.title}” has an approved answer.`, href: `/doubts/${doubt.id}` };
  } else throw new Error('Unknown notification event');
  try {
    await Notification.updateOne({ key: values.key }, { $setOnInsert: values }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}
