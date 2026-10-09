import Badge from '../models/Badge.js';
import UserBadge from '../models/UserBadge.js';
import UserStats from '../models/UserStats.js';

export const BADGES = [
  { key: 'first-solve', name: 'First solve', description: 'Solve your first problem.', icon: '🌱', rule: { metric: 'solvedCount', threshold: 1 } },
  { key: 'five-solves', name: 'Getting started', description: 'Solve five unique problems.', icon: '⭐', rule: { metric: 'solvedCount', threshold: 5 } },
  { key: 'ten-solves', name: 'Problem solver', description: 'Solve ten unique problems.', icon: '🏆', rule: { metric: 'solvedCount', threshold: 10 } },
  { key: 'seven-day-streak', name: 'Week of wins', description: 'Solve problems on seven consecutive UTC days.', icon: '🔥', rule: { metric: 'longestStreak', threshold: 7 } },
  { key: 'level-five', name: 'Level five', description: 'Reach level five.', icon: '🚀', rule: { metric: 'level', threshold: 5 } },
];

export async function seedBadges() {
  // $setOnInsert preserves an existing catalog's deliberately edited rules.
  try {
    await Badge.bulkWrite(BADGES.map((badge) => ({ updateOne: {
    filter: { key: badge.key }, update: { $setOnInsert: badge }, upsert: true,
  } })), { ordered: false });
  } catch (err) {
    // Another completion worker can seed the same unique catalog concurrently.
    if (err.code !== 11000 || err.writeErrors?.some((failure) => failure.code !== 11000)) throw err;
  }
}

export async function checkBadges(userId, event) {
  if (event.type !== 'solve') return [];
  await seedBadges();
  const stats = await UserStats.findOne({ userId }).lean();
  if (!stats) return [];
  const eligible = (await Badge.find().lean()).filter((badge) => stats[badge.rule.metric] >= badge.rule.threshold);
  for (const badge of eligible) {
    try {
      await UserBadge.updateOne({ userId, badgeId: badge._id },
        { $setOnInsert: { userId, badgeId: badge._id, awardedAt: event.awardedAt } }, { upsert: true });
    } catch (err) { if (err.code !== 11000) throw err; }
  }
  return eligible.map((badge) => badge.key);
}
