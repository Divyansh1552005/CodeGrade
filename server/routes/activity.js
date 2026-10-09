import { Router } from 'express';
import UserStats from '../models/UserStats.js';
import UserBadge from '../models/UserBadge.js';
import { levelProgress, visibleStreak } from '../services/gamificationService.js';
import { getLeaderboard } from '../services/leaderboardService.js';
import StudentStats from '../models/StudentStats.js';
import Notification from '../models/Notification.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../middleware/errorHandler.js';
const router = Router();
router.use(requireAuth);
router.get('/progress', async (req, res, next) => {
  try {
    const [analytics, stats, earned] = await Promise.all([
      StudentStats.findOne({ studentId: req.user._id }).lean(),
      UserStats.findOne({ userId: req.user._id }).lean(),
      UserBadge.find({ userId: req.user._id }).populate('badgeId').sort({ awardedAt: 1 }).lean(),
    ]);
    const badges = earned.filter((entry) => entry.badgeId).map((entry) => ({ ...entry.badgeId, awardedAt: entry.awardedAt }));
    res.json({ progress: {
      submissionCount: analytics?.submissionCount ?? 0, passedTests: analytics?.passedTests ?? 0, totalTests: analytics?.totalTests ?? 0,
      xp: stats?.xp ?? 0, solvedCount: stats?.solvedCount ?? 0, ...levelProgress(stats?.xp ?? 0),
      currentStreak: visibleStreak(stats), longestStreak: stats?.longestStreak ?? 0, lastSolvedDate: stats?.lastSolvedDate ?? null,
      badges, achievements: badges.map((badge) => badge.key),
    } });
  } catch (err) { next(err); }
});
router.get('/leaderboard', async (_req, res, next) => {
  try {
    res.json({ entries: await getLeaderboard('global'), cacheSeconds: 30 });
  } catch (err) { next(err); }
});
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id, key: { $not: /^submission-/ } }).sort({ createdAt: -1, _id: -1 }).limit(30);
    res.json({ notifications });
  } catch (err) { next(err); }
});
router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id, key: { $not: /^submission-/ } },
      { $set: { readAt: new Date() } }, { new: true });
    if (!notification) throw httpError(404, 'Notification not found');
    res.json({ notification });
  } catch (err) { next(err); }
});
export default router;
