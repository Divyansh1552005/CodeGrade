import UserStats from '../models/UserStats.js';

// Thirty-second, per-API-process cache. TTL bounds staleness across API/worker
// processes without letting a Redis outage block reading durable stats.
const cache = new Map();
export function clearLeaderboardCache() { cache.clear(); }
export async function getLeaderboard(scope = 'global', topic) {
  const key = scope === 'topic' ? `topic:${topic}` : 'global';
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.entries;
  const pipeline = scope === 'topic' ? [
    { $unwind: '$topicXp' }, { $match: { 'topicXp.topic': topic, 'topicXp.xp': { $gt: 0 } } },
    { $set: { xp: '$topicXp.xp' } },
  ] : [{ $match: { xp: { $gt: 0 } } }];
  const entries = await UserStats.aggregate([...pipeline,
    { $sort: { xp: -1, solvedCount: -1, userId: 1 } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' }, { $match: { 'user.role': 'student' } }, { $limit: 20 },
    { $project: { xp: 1, level: 1, solvedCount: 1, userId: { _id: '$user._id', name: '$user.name' }, studentId: { _id: '$user._id', name: '$user.name' } } },
  ]);
  cache.set(key, { entries, expiresAt: Date.now() + 30000 });
  return entries;
}
