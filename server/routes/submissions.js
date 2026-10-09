import { Router } from 'express';
import Submission from '../models/Submission.js';
import Problem from '../models/Problem.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validate } from '../middleware/validate.js';
import { httpError } from '../middleware/errorHandler.js';
import {
  rateLimit,
  submissionMinuteLimiter,
  submissionDailyLimiter,
} from '../middleware/rateLimit.js';
import { enqueueSubmission } from '../services/submissionQueue.js';
import { assertRunnable } from '../services/judge0Client.js';
import { createSubmissionSchema } from '../validation/schemas.js';

const router = Router();

// POST /submissions  { problemId, code, language }  — students only submit for
// grading. The problem is language-agnostic; the STUDENT picks the language.
// Shape (ids/types/language allowlist/code length) is validated by zod;
// domain checks (problem exists, isn't archived) stay here.
//
// Rate-limited on top of the general per-user limit in requireAuth: at most
// two submissions per minute, and 20 per rolling 24h, per student. The minute
// check runs first so a within-cooldown resubmit never spends a daily point.
router.post(
  '/',
  requireAuth,
  requireRole('student'),
  rateLimit(
    submissionMinuteLimiter,
    (retry) => `You can submit at most twice per minute — try again in ${retry}.`
  ),
  rateLimit(
    submissionDailyLimiter,
    (retry) => `You've reached today's limit of 20 submissions — try again in ${retry}.`
  ),
  validate(createSubmissionSchema),
  async (req, res, next) => {
    try {
      const { problemId, code, language } = req.body;

      const problem = await Problem.findById(problemId);
      if (!problem) throw httpError(404, 'Problem not found');
      if (problem.archived) throw httpError(400, 'This problem is no longer available');

      // Throws a 400-ish Judge0Error for empty/oversized/bad-language input
      // (belt-and-suspenders alongside the zod checks above).
      assertRunnable(language, code);

      const submission = await Submission.create({
        studentId: req.user._id,
        problemId: problem._id,
        code,
        language,
        status: 'queued',
        testCasesSnapshot: problem.testCases,
        rewardDifficulty: problem.difficulty,
        rewardTopics: problem.topics,
      });

      try {
        await enqueueSubmission(submission._id.toString(), problem.testCases);
      } catch (err) {
        // Never leave a rejected enqueue looking like pending work.
        await Submission.updateOne(
          { _id: submission._id, status: 'queued' },
          { $set: { status: 'error', error: 'Unable to queue grading. Please resubmit.' } }
        );
        console.error('Submission enqueue failed:', err.message);
        throw httpError(503, 'Unable to queue grading. Please try again.');
      }

      const publicSubmission = submission.toObject();
      delete publicSubmission.testCasesSnapshot;
      res.status(202).json({ submissionId: submission._id, submission: publicSubmission });
    } catch (err) {
      next(err);
    }
  }
);

// GET /submissions[?problemId=]  — own submissions (students) or all (teachers),
// optionally filtered to a single problem.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const filter = req.user.role === 'teacher' ? {} : { studentId: req.user._id };
    if (req.query.problemId) filter.problemId = req.query.problemId;
    const submissions = await Submission.find(filter)
      .sort({ createdAt: -1 })
      .populate('problemId', 'title');
    res.json({ submissions });
  } catch (err) {
    next(err);
  }
});

// GET /submissions/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const submission = await Submission.findById(req.params.id).populate(
      'problemId',
      'title language'
    );
    if (!submission) throw httpError(404, 'Submission not found');
    // Students can only see their own.
    if (
      req.user.role !== 'teacher' &&
      submission.studentId.toString() !== req.user._id.toString()
    ) {
      throw httpError(403, 'Forbidden');
    }
    res.json({ submission });
  } catch (err) {
    next(err);
  }
});

export default router;
