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
import { gradeSubmission } from '../services/gradingService.js';
import { generateFeedback } from '../services/aiFeedbackChain.js';
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
        status: 'running',
      });

      try {
        const graded = await gradeSubmission({
          language,
          code,
          testCases: problem.testCases,
        });
        submission.testResults = graded.testResults;
        submission.passCount = graded.passCount;
        submission.totalCount = graded.totalCount;

        // AI feedback is best-effort: a failure here should not fail grading.
        try {
          submission.aiFeedback = await generateFeedback({
            language,
            code,
            passCount: graded.passCount,
            totalCount: graded.totalCount,
            testResults: graded.testResults,
          });
        } catch (aiErr) {
          console.error('AI feedback failed:', aiErr.message);
        }

        submission.status = 'graded';
        await submission.save();
      } catch (execErr) {
        submission.status = 'error';
        submission.error = execErr.message;
        await submission.save();
        throw execErr;
      }

      res.status(201).json({ submission });
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
