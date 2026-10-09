import UserStats from '../models/UserStats.js';
import GamificationEvent from '../models/GamificationEvent.js';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import { checkBadges } from './badgeService.js';

export const XP_BY_DIFFICULTY = { easy: 100, medium: 200, hard: 300 };
const DAY = 86400000;
export function levelProgress(xp = 0) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
  const levelStartXp = 100 * (level - 1) ** 2;
  const nextLevelXp = 100 * level ** 2;
  return { level, levelStartXp, nextLevelXp, xpIntoLevel: xp - levelStartXp, xpForNextLevel: nextLevelXp - levelStartXp };
}
export function solveStreak(lastSolvedDate, currentStreak, awardedAt) {
  const today = Math.floor(new Date(awardedAt).getTime() / DAY);
  const previous = lastSolvedDate ? Math.floor(new Date(lastSolvedDate).getTime() / DAY) : undefined;
  if (previous === today) return currentStreak;
  return previous === today - 1 ? currentStreak + 1 : 1;
}
export function visibleStreak(stats, now = new Date()) {
  if (!stats?.lastSolvedDate) return 0;
  const elapsed = Math.floor(now.getTime() / DAY) - Math.floor(new Date(stats.lastSolvedDate).getTime() / DAY);
  return elapsed > 1 ? 0 : stats.currentStreak;
}

export async function projectAwards(userId) {
  const events = await GamificationEvent.find({ userId }).sort({ awardedAt: 1, _id: 1 }).lean();
  const solved = new Set(), topicXp = new Map();
  let xp = 0, currentStreak = 0, longestStreak = 0, lastSolvedDate;
  for (const event of events) {
    currentStreak = solveStreak(lastSolvedDate, currentStreak, event.awardedAt);
    longestStreak = Math.max(longestStreak, currentStreak);
    lastSolvedDate = event.awardedAt;
    const problemId = String(event.problemId);
    if (solved.has(problemId)) continue;
    solved.add(problemId);
    xp += event.xp;
    for (const topic of new Set(event.topics)) topicXp.set(topic, (topicXp.get(topic) || 0) + event.xp);
  }
  const values = { userId, xp, level: levelProgress(xp).level, currentStreak, longestStreak,
    lastSolvedDate, solvedCount: solved.size, eventCount: events.length,
    topicXp: [...topicXp].map(([topic, points]) => ({ topic, xp: points })) };
  // Immutable events only grow. A stale concurrent projection cannot replace a
  // newer one; an equal-size snapshot necessarily contains the same events.
  try {
    await UserStats.updateOne({ userId, eventCount: { $lte: events.length } }, { $set: values }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
    await UserStats.updateOne({ userId, eventCount: { $lte: events.length } }, { $set: values });
  }
  return UserStats.findOne({ userId }).lean();
}

export async function awardSubmission(submissionId, now = new Date()) {
  const submission = await Submission.findById(submissionId);
  if (!submission || submission.status !== 'graded' || submission.totalCount <= 0 || submission.passCount !== submission.totalCount) return null;
  const problem = await Problem.findById(submission.problemId).lean();
  const difficulty = submission.rewardDifficulty || problem?.difficulty || 'easy';
  const input = { submissionId: submission._id, userId: submission.studentId, problemId: submission.problemId,
    difficulty, xp: XP_BY_DIFFICULTY[difficulty], topics: submission.rewardTopics ?? problem?.topics ?? [], awardedAt: now };
  try {
    await GamificationEvent.updateOne({ submissionId: submission._id }, { $setOnInsert: input }, { upsert: true });
  } catch (err) { if (err.code !== 11000) throw err; }
  const event = await GamificationEvent.findOne({ submissionId: submission._id }).lean();
  const stats = await projectAwards(submission.studentId);
  await checkBadges(submission.studentId, { type: 'solve', awardedAt: event.awardedAt });
  return stats;
}
