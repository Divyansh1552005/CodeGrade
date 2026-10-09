import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import WorkItem from '../models/WorkItem.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validate } from '../middleware/validate.js';
import { httpError } from '../middleware/errorHandler.js';
import { createProblemSchema } from '../validation/schemas.js';
import { ensureWork } from '../services/workService.js';
const router = Router();
const TYPES = ['problem-import', 'problem-export', 'report-export'];
router.use(requireAuth, requireRole('teacher'));
router.post('/', validate(z.discriminatedUnion('type', [
  z.object({ type: z.literal('problem-import'), problems: z.array(createProblemSchema).min(1).max(100) }),
  z.object({ type: z.literal('problem-export') }),
  z.object({ type: z.literal('report-export') }),
])), async (req, res, next) => {
  try {
    const active = await WorkItem.countDocuments({ ownerId: req.user._id, type: { $in: TYPES }, status: { $in: ['pending', 'queued', 'running'] } });
    if (active >= 3) throw httpError(429, 'Please wait for your current bulk jobs to finish.');
    const job = await ensureWork({ key: `bulk-${randomUUID()}`, ownerId: req.user._id,
      type: req.body.type, payload: req.body.type === 'problem-import' ? { problems: req.body.problems } : {} });
    res.status(202).json({ job: { _id: job.id, type: job.type, status: job.status } });
  } catch (err) { next(err); }
});
router.get('/', async (req, res, next) => {
  try {
    const jobs = await WorkItem.find({ ownerId: req.user._id, type: { $in: TYPES } })
      .sort({ createdAt: -1 }).limit(20).select('-payload -result');
    res.json({ jobs });
  } catch (err) { next(err); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const job = await WorkItem.findOne({ _id: req.params.id, ownerId: req.user._id, type: { $in: TYPES } }).select('-payload');
    if (!job) throw httpError(404, 'Job not found');
    res.json({ job });
  } catch (err) { next(err); }
});
export default router;
