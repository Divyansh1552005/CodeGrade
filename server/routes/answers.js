import { Router } from 'express';
import Answer from '../models/Answer.js';
import Doubt from '../models/Doubt.js';
import { recordAnswerNotification } from '../services/workService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validate } from '../middleware/validate.js';
import { httpError } from '../middleware/errorHandler.js';
import { InvalidStateTransitionError } from '../models/Answer.js';
import { createAnswerSchema, reviewAnswerSchema } from '../validation/schemas.js';
import { findVisibleDoubt, populateVisibleDoubt, withVisibleDoubts } from '../services/doubtAccess.js';

const router = Router();

// GET /answers?state=pending  — teacher review queue (teachers only)
router.get('/', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.state) filter.state = req.query.state;
    // Answers whose doubt the viewer cannot see (for example an auto-rejected doubt) are dropped.
    const answers = await Answer.find(filter)
      .sort({ createdAt: -1 })
      .populate(populateVisibleDoubt(req.user));
    res.json({ answers: withVisibleDoubts(answers, req.user) });
  } catch (err) {
    next(err);
  }
});

// POST /answers  { doubtId, content }  — teacher writes an answer manually.
// A human wrote it, so there is no AI content to review: it is created and
// immediately approved (no pending step). The Answer state machine still governs
// the transition (created 'pending' -> 'approved').
router.post(
  '/',
  requireAuth,
  requireRole('teacher'),
  validate(createAnswerSchema),
  async (req, res, next) => {
    try {
      const { doubtId, content } = req.body;
      const doubt = await findVisibleDoubt(doubtId, req.user);
      if (!doubt) throw httpError(404, 'Doubt not found');

      const answer = new Answer({
        doubtId,
        content,
        source: 'teacher',
        state: 'pending',
      });
      await answer.save();

      // Auto-approve: the teacher authored it directly.
      answer.state = 'approved';
      answer.reviewedBy = req.user._id;
      answer.reviewedAt = new Date();
      await answer.save();

      // Answering an appealed doubt confirms it is on topic: it joins the board like any other doubt.
      if (doubt.status === 'appealed') await Doubt.updateOne({ _id: doubt._id, status: 'appealed' }, { $set: { status: 'pending_review' } });

      // Recovery also records this event if the process exits after approval.
      await recordAnswerNotification(answer);
      res.status(201).json({ answer });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Shared handler for approve/reject. The actual transition legality is enforced
 * by the Answer model's pre-save hook, so an already-approved/rejected answer
 * (or any illegal jump) throws InvalidStateTransitionError -> 400.
 */
function review(targetState) {
  return async function handler(req, res, next) {
    try {
      const answer = await Answer.findById(req.params.id);
      if (!answer) throw httpError(404, 'Answer not found');

      // Guard the terminal/no-op case: reviewing anything not currently pending
      // is illegal. (Mongoose won't flag a same-value assignment as modified,
      // so the model hook can't catch a re-approve on its own — we do it here,
      // and the model remains the backstop for genuine state changes.)
      if (answer.state !== 'pending') {
        throw new InvalidStateTransitionError(answer.state, targetState);
      }

      answer.state = targetState;
      answer.reviewedBy = req.user._id;
      answer.reviewedAt = new Date();
      if (typeof req.body?.reviewNotes === 'string') {
        answer.reviewNotes = req.body.reviewNotes;
      }
      // Teachers may optionally edit the content on approval.
      if (targetState === 'approved' && typeof req.body?.content === 'string') {
        answer.content = req.body.content;
      }

      await answer.save(); // throws on illegal transition
      await recordAnswerNotification(answer);
      res.json({ answer });
    } catch (err) {
      next(err);
    }
  };
}

// PATCH /answers/:id/approve  — teacher only, pending -> approved
router.patch(
  '/:id/approve',
  requireAuth,
  requireRole('teacher'),
  validate(reviewAnswerSchema),
  review('approved')
);

// PATCH /answers/:id/reject   — teacher only, pending -> rejected
router.patch(
  '/:id/reject',
  requireAuth,
  requireRole('teacher'),
  validate(reviewAnswerSchema),
  review('rejected')
);

export default router;
