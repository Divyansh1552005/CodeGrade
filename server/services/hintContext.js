import Submission from '../models/Submission.js';
import HintThread from '../models/HintThread.js';
import { aiLimits } from '../config/aiLimits.js';

/**
 * The student's latest verdict, read from the database. Only a coarse category and the pass
 * counts are used; no test input, expected output or per-test result ever leaves this function,
 * and nothing about the verdict comes from the client.
 */
export async function latestVerdict(userId, problemId) {
  const latest = await Submission.findOne({ studentId: userId, problemId })
    .sort({ createdAt: -1 }).select('status passCount totalCount').lean();
  if (!latest) return { category: 'none' };
  if (['queued', 'running'].includes(latest.status)) return { category: 'pending' };
  if (latest.status === 'error') return { category: 'error' };
  const passed = latest.passCount ?? 0;
  const total = latest.totalCount ?? 0;
  if (total > 0 && passed === total) return { category: 'accepted', passed, total };
  return { category: passed > 0 ? 'partial' : 'failing', passed, total };
}

/** True once the student has any accepted submission for this problem. */
export async function hasAccepted(userId, problemId) {
  return Boolean(await Submission.exists({
    studentId: userId, problemId, status: 'graded', totalCount: { $gt: 0 },
    $expr: { $eq: ['$passCount', '$totalCount'] },
  }));
}

export const nextLevel = (hintsUsed) => Math.min(aiLimits().hints.maxLevel, (hintsUsed ?? 0) + 1);

export async function loadThread(userId, problemId) {
  const thread = await HintThread.findOne({ userId, problemId }).lean();
  return { messages: thread?.messages ?? [], hintsUsed: thread?.hintsUsed ?? 0 };
}

export async function saveExchange({ userId, problemId, userText, reply, level, fallback }) {
  const { maxThreadMessages } = aiLimits().hints;
  const now = new Date();
  const thread = await HintThread.findOneAndUpdate(
    { userId, problemId },
    {
      $push: { messages: { $each: [
        { role: 'user', content: userText, level, createdAt: now },
        { role: 'assistant', content: reply, level, fallback, createdAt: new Date(now.getTime() + 1) },
      ], $slice: -maxThreadMessages } },
      // A fallback reply is not a real hint, so it does not raise the level.
      $inc: { hintsUsed: fallback ? 0 : 1 },
    },
    { upsert: true, new: true }
  );
  return { messages: thread.messages.slice(-2), hintsUsed: thread.hintsUsed };
}
