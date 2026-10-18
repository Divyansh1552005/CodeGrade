import { Router } from 'express';
import { requireAnyAuth } from '../middleware/auth.js';
import { applicationView } from '../services/teacherApplications.js';

const router = Router();

// GET /teacher-application  — the signed-in user's own application, so a teacher_applicant can see its status.
// Open to any signed-in role (an applicant is refused by every other route); anyone without an application gets 404.
router.get('/', requireAnyAuth, async (req, res, next) => {
  try {
    const application = await applicationView(req.user._id);
    if (!application) return res.status(404).json({ error: 'No application' });
    return res.json({ application });
  } catch (err) {
    return next(err);
  }
});

export default router;
