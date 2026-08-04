import { Router } from 'express';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { httpError } from '../middleware/errorHandler.js';
import { SUPPORTED_LANGUAGES } from '../services/languageMap.js';

const router = Router();

// Keep only known-language string keys from a starterCode object.
function sanitizeStarterCode(starterCode) {
  const out = {};
  if (starterCode && typeof starterCode === 'object') {
    for (const lang of SUPPORTED_LANGUAGES) {
      if (typeof starterCode[lang] === 'string') out[lang] = starterCode[lang];
    }
  }
  return out;
}

// Validate a testCases array: non-empty, each entry has string input+expectedOutput.
function validateTestCases(testCases) {
  if (!Array.isArray(testCases) || testCases.length === 0) {
    throw httpError(400, 'testCases must be a non-empty array');
  }
  testCases.forEach((tc, i) => {
    if (typeof tc?.input !== 'string' || typeof tc?.expectedOutput !== 'string') {
      throw httpError(
        400,
        `testCases[${i}] must have string "input" and "expectedOutput"`
      );
    }
  });
}

// Statement sections every teacher-authored problem must fill in.
const REQUIRED_TEXT_FIELDS = ['inputFormat', 'outputFormat', 'constraints'];

// A required free-text field: present, a string, and not just whitespace.
function validateRequiredText(field, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw httpError(400, `${field} is required`);
  }
}

// Validate sampleCases: non-empty, each entry with non-empty input + output.
// `explanation` is optional but must be a string when present.
function validateSampleCases(sampleCases) {
  if (!Array.isArray(sampleCases) || sampleCases.length === 0) {
    throw httpError(400, 'sampleCases must be a non-empty array');
  }
  sampleCases.forEach((sc, i) => {
    if (typeof sc?.input !== 'string' || !sc.input.trim()) {
      throw httpError(400, `sampleCases[${i}] must have a non-empty "input"`);
    }
    if (typeof sc?.output !== 'string' || !sc.output.trim()) {
      throw httpError(400, `sampleCases[${i}] must have a non-empty "output"`);
    }
    if (sc.explanation !== undefined && typeof sc.explanation !== 'string') {
      throw httpError(400, `sampleCases[${i}].explanation must be a string`);
    }
  });
}

// Keep only the fields we store, so clients can't inject extras.
const pickSampleCases = (sampleCases) =>
  sampleCases.map((sc) => ({
    input: sc.input,
    output: sc.output,
    explanation: sc.explanation || '',
  }));

// Load a problem and assert the requester created it (creator-only edit rule).
async function loadOwnedProblem(req) {
  const problem = await Problem.findById(req.params.id);
  if (!problem) throw httpError(404, 'Problem not found');
  if (problem.createdBy?.toString() !== req.user._id.toString()) {
    throw httpError(403, 'Forbidden: only the teacher who created this problem can modify it');
  }
  return problem;
}

// GET /problems  — list all (non-archived) problems; any authenticated user.
// For students, each problem is annotated with `solved` = they have a graded
// submission that passed every test case.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const problems = await Problem.find({ archived: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean();

    if (req.user.role === 'student') {
      const graded = await Submission.find({
        studentId: req.user._id,
        status: 'graded',
      })
        .select('problemId passCount totalCount')
        .lean();
      const solved = new Set(
        graded
          .filter((s) => s.totalCount > 0 && s.passCount === s.totalCount)
          .map((s) => String(s.problemId))
      );
      for (const p of problems) p.solved = solved.has(String(p._id));
    }

    res.json({ problems });
  } catch (err) {
    next(err);
  }
});

// GET /problems/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const problem = await Problem.findById(req.params.id);
    if (!problem) throw httpError(404, 'Problem not found');
    res.json({ problem });
  } catch (err) {
    next(err);
  }
});

// POST /problems  — teachers only
router.post('/', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const { title, description, starterCode, testCases, sampleCases } = req.body || {};

    if (!title || !description) {
      throw httpError(400, 'title and description are required');
    }
    for (const field of REQUIRED_TEXT_FIELDS) {
      validateRequiredText(field, req.body?.[field]);
    }
    validateSampleCases(sampleCases);
    validateTestCases(testCases);

    const problem = await Problem.create({
      title,
      description,
      inputFormat: req.body.inputFormat,
      outputFormat: req.body.outputFormat,
      constraints: req.body.constraints,
      sampleCases: pickSampleCases(sampleCases),
      starterCode: sanitizeStarterCode(starterCode),
      testCases,
      createdBy: req.user._id,
    });
    res.status(201).json({ problem });
  } catch (err) {
    next(err);
  }
});

// PATCH /problems/:id  — teacher-only, creator-only. Partial update.
router.patch('/:id', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const problem = await loadOwnedProblem(req);
    const { title, description, starterCode, testCases, sampleCases } = req.body || {};

    if (title !== undefined) {
      if (!title) throw httpError(400, 'title cannot be empty');
      problem.title = title;
    }
    if (description !== undefined) {
      if (!description) throw httpError(400, 'description cannot be empty');
      problem.description = description;
    }
    // These sections are mandatory, so a partial update may change them but
    // never blank them out.
    for (const field of REQUIRED_TEXT_FIELDS) {
      if (req.body?.[field] !== undefined) {
        validateRequiredText(field, req.body[field]);
        problem[field] = req.body[field];
      }
    }
    if (sampleCases !== undefined) {
      validateSampleCases(sampleCases);
      problem.sampleCases = pickSampleCases(sampleCases);
    }
    if (starterCode !== undefined) problem.starterCode = sanitizeStarterCode(starterCode);
    if (testCases !== undefined) {
      validateTestCases(testCases);
      problem.testCases = testCases;
    }

    await problem.save();
    res.json({ problem });
  } catch (err) {
    next(err);
  }
});

// DELETE /problems/:id  — teacher-only, creator-only.
// Soft-delete (archive) when Submissions reference it so history is preserved;
// otherwise hard-delete.
router.delete('/:id', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const problem = await loadOwnedProblem(req);
    const referencing = await Submission.countDocuments({ problemId: problem._id });

    if (referencing > 0) {
      problem.archived = true;
      await problem.save();
      return res.json({ deleted: true, softDeleted: true, referencingSubmissions: referencing });
    }

    await problem.deleteOne();
    return res.json({ deleted: true, softDeleted: false });
  } catch (err) {
    next(err);
  }
});

export default router;
