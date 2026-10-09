import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../middleware/errorHandler.js';
import { TOPICS } from '../constants/topics.js';
import { getLeaderboard } from '../services/leaderboardService.js';
const router = Router();
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const scope = req.query.scope ?? 'global';
    const topic = req.query.topic;
    if (!['global', 'topic'].includes(scope)) throw httpError(400, 'scope must be global or topic');
    if (scope === 'topic' && !TOPICS.includes(topic)) throw httpError(400, 'A supported topic is required for topic scope');
    res.json({ scope, ...(scope === 'topic' ? { topic } : {}), entries: await getLeaderboard(scope, topic), cacheSeconds: 30 });
  } catch (err) { next(err); }
});
export default router;
