import { Router } from 'express';
import StudentStats from '../models/StudentStats.js';
import Notification from '../models/Notification.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../middleware/errorHandler.js';
import { streaks } from '../services/progressService.js';
const router = Router();
router.use(requireAuth);
router.get('/progress', async (req, res, next) => {
  try {
    const stats = await StudentStats.findOne({ studentId: req.user._id }).lean();
    res.json({ progress: stats ? { ...stats, ...streaks(stats.activityDays) } : {
      submissionCount: 0, solvedCount: 0, xp: 0, passedTests: 0, totalTests: 0,
      currentStreak: 0, longestStreak: 0, achievements: [],
    } });
  } catch (err) { next(err); }
});
router.get('/leaderboard', async (_req, res, next) => {
  try {
    const entries = await StudentStats.find({ xp: { $gt: 0 } }).sort({ xp: -1, solvedCount: -1, studentId: 1 })
      .limit(20).select('studentId xp solvedCount').populate({ path: 'studentId', select: 'name', match: { role: 'student' } }).lean();
    res.json({ entries: entries.filter((e) => e.studentId) });
  } catch (err) { next(err); }
});
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1, _id: -1 }).limit(30);
    res.json({ notifications });
  } catch (err) { next(err); }
});
router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id },
      { $set: { readAt: new Date() } }, { new: true });
    if (!notification) throw httpError(404, 'Notification not found');
    res.json({ notification });
  } catch (err) { next(err); }
});
export default router;
