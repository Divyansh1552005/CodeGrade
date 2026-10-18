import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { httpError } from '../middleware/errorHandler.js';
import { objectId } from '../validation/schemas.js';
import { listNotifications, unreadCount, markRead, markAllRead } from '../services/notificationService.js';

const router = Router();
router.use(requireAuth);

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(300).optional(),
});
const idParams = z.object({ id: objectId });

// Every route is scoped to the signed-in user: there is no way to name another user's data.
router.get('/', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    res.json(await listNotifications(req.user._id, req.query));
  } catch (err) { next(err); }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    res.json({ unread: await unreadCount(req.user._id) });
  } catch (err) { next(err); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    res.json({ updated: await markAllRead(req.user._id) });
  } catch (err) { next(err); }
});

router.patch('/:id/read', validate(idParams, 'params'), async (req, res, next) => {
  try {
    const notification = await markRead(req.user._id, req.params.id);
    if (!notification) throw httpError(404, 'Notification not found');
    res.json({ notification });
  } catch (err) { next(err); }
});

export default router;
