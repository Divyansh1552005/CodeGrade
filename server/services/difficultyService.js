import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';

export const MIN_DIFFICULTY_SAMPLE = 10;
export function difficultyFromPassRate(passRate) {
  return passRate >= 0.7 ? 'easy' : passRate >= 0.3 ? 'medium' : 'hard';
}
export async function recalculateDifficulties(now = new Date()) {
  // One latest terminal attempt per student/problem prevents repeated submissions
  // by one student from dominating the displayed pass rate. Infrastructure
  // errors are excluded: only genuinely graded attempts enter the sample.
  const rows = await Submission.aggregate([
    { $match: { status: 'graded', totalCount: { $gt: 0 } } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $group: { _id: { problemId: '$problemId', studentId: '$studentId' }, passed: { $first: { $eq: ['$passCount', '$totalCount'] } } } },
    { $group: { _id: '$_id.problemId', sampleSize: { $sum: 1 }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
  ]);
  for (const row of rows) {
    const passRate = row.passed / row.sampleSize;
    const values = { passRate, difficultySampleSize: row.sampleSize, difficultyUpdatedAt: now };
    if (row.sampleSize >= MIN_DIFFICULTY_SAMPLE) values.difficulty = difficultyFromPassRate(passRate);
    await Problem.updateOne({ _id: row._id }, { $set: values });
  }
  return { problemsExamined: rows.length };
}
