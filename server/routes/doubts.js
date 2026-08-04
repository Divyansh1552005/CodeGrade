import { Router } from 'express';
import Doubt from '../models/Doubt.js';
import Answer from '../models/Answer.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { httpError } from '../middleware/errorHandler.js';
import { generateDraftAnswer } from '../services/doubtDraftChain.js';
import { assertWithinLimit, LIMITS } from '../utils/sanitize.js';

const router = Router();

/**
 * Generate the AI draft for a doubt. Runs in the BACKGROUND (not awaited by the
 * POST handler) so posting a doubt returns instantly instead of blocking on the
 * LLM. It resolves the doubt's aiDraftStatus to 'success' or 'failed'.
 *
 * The LLM ONLY returns a content string; our code is the sole writer of `state`.
 * On success we create the answer directly as 'pending' (a valid initial state
 * in the model's state machine) — done in one write so an observer never sees a
 * transient 'draft'. On ANY failure (throw, timeout, or Zod schema rejection
 * inside generateDraftAnswer) we create NO broken Answer, mark the doubt
 * 'failed', and log — a teacher can then answer it manually.
 *
 * Never throws: safe to call fire-and-forget.
 */
export async function processDoubtDraft(doubtId, { title, body }) {
  try {
    const { draftAnswer } = await generateDraftAnswer({ title, body });
    await Answer.create({
      doubtId,
      content: draftAnswer,
      source: 'ai',
      state: 'pending',
    });

    await Doubt.findByIdAndUpdate(doubtId, { aiDraftStatus: 'success' });
  } catch (aiErr) {
    console.error(`AI draft failed for doubt ${doubtId}:`, aiErr.message);
    // Defensive: ensure no half-written Answer lingers for this doubt.
    await Answer.deleteMany({ doubtId });
    await Doubt.findByIdAndUpdate(doubtId, { aiDraftStatus: 'failed' });
  }
}

// POST /doubts  { title, body }  — students only. Posts immediately; the AI
// draft is generated in the background and the doubt's aiDraftStatus updates.
router.post('/', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { title, body } = req.body || {};
    if (!title || !body) {
      throw httpError(400, 'title and body are required');
    }
    // Length caps BEFORE anything reaches the LLM (injection/DoS mitigation).
    assertWithinLimit('title', title, LIMITS.doubtTitle);
    assertWithinLimit('body', body, LIMITS.doubtBody);

    const doubt = await Doubt.create({
      studentId: req.user._id,
      title,
      body,
      aiDraftStatus: 'pending',
    });

    // Fire-and-forget: don't block the response on the LLM. processDoubtDraft
    // never throws, but attach a catch for safety against unhandled rejections.
    processDoubtDraft(doubt._id, { title, body }).catch(() => {});

    // Respond right away; the draft is still 'pending' at this point.
    res.status(201).json({ doubt });
  } catch (err) {
    next(err);
  }
});

// GET /doubts  — shared board (list). Each doubt is annotated with
// `hasApprovedAnswer` so the list can render a status badge without N+1 calls.
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const doubts = await Doubt.find()
      .sort({ createdAt: -1 })
      .populate('studentId', 'name')
      .lean();

    const approvedIds = await Answer.find({
      doubtId: { $in: doubts.map((d) => d._id) },
      state: 'approved',
    }).distinct('doubtId');
    const approved = new Set(approvedIds.map(String));

    for (const d of doubts) d.hasApprovedAnswer = approved.has(String(d._id));
    res.json({ doubts });
  } catch (err) {
    next(err);
  }
});

// GET /doubts/failed  — teacher-only: doubts whose AI draft failed and that do
// not yet have any answer, so they need a manual answer. (Declared before the
// '/:id' route so it isn't captured as an id.)
router.get('/failed', requireAuth, requireRole('teacher'), async (_req, res, next) => {
  try {
    const failed = await Doubt.find({ aiDraftStatus: 'failed' })
      .sort({ createdAt: -1 })
      .populate('studentId', 'name');

    const answeredIds = await Answer.find({
      doubtId: { $in: failed.map((d) => d._id) },
    }).distinct('doubtId');
    const answered = new Set(answeredIds.map(String));

    res.json({ doubts: failed.filter((d) => !answered.has(String(d._id))) });
  } catch (err) {
    next(err);
  }
});

// GET /doubts/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const doubt = await Doubt.findById(req.params.id).populate('studentId', 'name');
    if (!doubt) throw httpError(404, 'Doubt not found');
    res.json({ doubt });
  } catch (err) {
    next(err);
  }
});

// GET /doubts/:id/answer  — students only ever see an APPROVED answer.
router.get('/:id/answer', requireAuth, async (req, res, next) => {
  try {
    const doubt = await Doubt.findById(req.params.id);
    if (!doubt) throw httpError(404, 'Doubt not found');

    const answer = await Answer.findOne({
      doubtId: doubt._id,
      state: 'approved',
    })
      .sort({ reviewedAt: -1 })
      // Include the teacher who approved/authored it, to show "answered by …".
      .populate('reviewedBy', 'name');

    // No approved answer yet -> nothing visible to the student.
    res.json({ answer: answer || null });
  } catch (err) {
    next(err);
  }
});

export default router;
