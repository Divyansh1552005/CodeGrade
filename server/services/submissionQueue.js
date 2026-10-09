import Submission from '../models/Submission.js';
import { ensureWork } from './workService.js';

export async function enqueueSubmission(submissionId, testCases) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw new Error('Submission not found');
  return ensureWork({ key: `grading-${submissionId}`, type: 'grading',
    ownerId: submission.studentId, payload: { submissionId, testCases } });
}
