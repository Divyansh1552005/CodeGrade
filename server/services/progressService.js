import Submission from '../models/Submission.js';
import StudentStats from '../models/StudentStats.js';
import { ensureWork } from './workService.js';

const DAY = 86400000;
const dayNumber = (day) => Date.parse(`${day}T00:00:00Z`) / DAY;

export function streaks(days, now = new Date()) {
  const sorted = [...new Set(days)].sort();
  let longestStreak = 0, length = 0, previous;
  for (const day of sorted) {
    const n = dayNumber(day);
    length = n === previous + 1 ? length + 1 : 1;
    longestStreak = Math.max(longestStreak, length);
    previous = n;
  }
  const today = Math.floor(now.getTime() / DAY);
  const currentStreak = previous >= today - 1 && previous <= today ? length : 0;
  return { longestStreak, currentStreak };
}

export async function rebuildStudentStats(studentId) {
  const rows = await Submission.find({ studentId, status: 'graded' })
    .select('problemId passCount totalCount createdAt').lean();
  const solvedProblemIds = [...new Set(rows.filter((s) => s.totalCount > 0 && s.passCount === s.totalCount)
    .map((s) => String(s.problemId)))];
  // Submission day, in UTC, determines activity even if a queue is delayed.
  const activityDays = [...new Set(rows.map((s) => s.createdAt.toISOString().slice(0, 10)))].sort();
  const { longestStreak } = streaks(activityDays);
  const solvedCount = solvedProblemIds.length;
  const achievements = [solvedCount >= 1 && 'first-solve', solvedCount >= 5 && 'five-solves',
    solvedCount >= 10 && 'ten-solves', longestStreak >= 7 && 'seven-day-streak'].filter(Boolean);
  const values = { studentId, submissionCount: rows.length, solvedProblemIds, solvedCount,
    passedTests: rows.reduce((sum, s) => sum + s.passCount, 0),
    totalTests: rows.reduce((sum, s) => sum + s.totalCount, 0),
    xp: solvedCount * 100, activityDays, longestStreak, achievements };
  // Graded rows are immutable and never deleted by app routes. Count is a
  // monotonic revision: an older concurrent rebuild cannot replace newer stats.
  try {
    await StudentStats.updateOne({ studentId, submissionCount: { $lte: rows.length } },
      { $set: values }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Retry a concurrent initial insert; a newer snapshot remains protected.
    await StudentStats.updateOne({ studentId, submissionCount: { $lte: rows.length } }, { $set: values });
  }
  return values;
}

export async function processCompletion(job) {
  const submission = await Submission.findById(job.data.submissionId);
  if (!submission || submission.status !== 'graded') throw new Error('Graded submission not found');
  const stats = await rebuildStudentStats(submission.studentId);
  await ensureWork({ key: `submission-notification-${submission.id}`, type: 'notification',
    ownerId: submission.studentId, payload: { submissionId: submission.id } });
  return { xp: stats.xp, solvedCount: stats.solvedCount };
}
