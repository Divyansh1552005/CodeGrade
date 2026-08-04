import { Router } from 'express';
import Submission from '../models/Submission.js';
import Problem from '../models/Problem.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { httpError } from '../middleware/errorHandler.js';
import { gradeSubmission } from '../services/gradingService.js';
import { generateFeedback } from '../services/aiFeedbackChain.js';
import { assertRunnable, LANGUAGE_IDS, MAX_CODE_LENGTH } from '../services/judge0Client.js';

const router = Router();

// POST /submissions  { problemId, code, language }  — students only submit for
// grading. The problem is language-agnostic; the STUDENT picks the language.
router.post('/', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { problemId, code, language } = req.body || {};
    if (!problemId || typeof code !== 'string' || !language) {
      throw httpError(400, 'problemId, code and language are required');
    }

    const problem = await Problem.findById(problemId);
    if (!problem) throw httpError(404, 'Problem not found');
    if (problem.archived) throw httpError(400, 'This problem is no longer available');

    // Guard: allowlisted language + code length cap, BEFORE any execution.
    if (!Object.prototype.hasOwnProperty.call(LANGUAGE_IDS, language)) {
      throw httpError(400, `Unsupported language: ${language}`);
    }
    if (code.length > MAX_CODE_LENGTH) {
      throw httpError(400, `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`);
    }
    // Throws a 400-ish Judge0Error for empty/oversized/bad-language input.
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
});

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
