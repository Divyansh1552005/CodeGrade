import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { featureSnapshot } from '../config/features.js';

const router = Router();

// GET /features — which optional features are on, so the UI can hide what is off.
router.get('/', requireAuth, (_req, res) => {
  res.json({ features: featureSnapshot() });
});

export default router;
