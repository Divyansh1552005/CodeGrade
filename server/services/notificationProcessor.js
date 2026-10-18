import { createNotification } from './notificationService.js';
import Answer from '../models/Answer.js';
import Doubt from '../models/Doubt.js';

export async function processNotification(job) {
  // Retire grading notifications already queued by an older worker release.
  if (job.data.submissionId) return;
  if (!job.data.answerId) throw new Error('Unknown notification event');
  const answer = await Answer.findById(job.data.answerId);
  if (!answer || answer.state !== 'approved') return;
  const doubt = await Doubt.findById(answer.doubtId);
  if (!doubt) return;
  await createNotification({
    key: `answer-${answer.id}`, userId: doubt.studentId, type: 'answer_approved',
    title: 'Your doubt has an approved answer', body: doubt.title, link: `/doubts/${doubt.id}`,
  });
}
