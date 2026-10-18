import { Router } from 'express';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { viewerKind } from '../utils/roles.js';
import { validate } from '../middleware/validate.js';
import { httpError } from '../middleware/errorHandler.js';
import { TOPICS } from '../constants/topics.js';
import { createProblemSchema, patchProblemSchema } from '../validation/schemas.js';
import { decodeCursor, encodeCursor, cursorFilter } from '../utils/pagination.js';

const MAX_PAGE_LIMIT = 100;

const router = Router();

// Load a problem and assert the requester created it (creator-only edit rule).
async function loadOwnedProblem(req) {
  const problem = await Problem.findById(req.params.id);
  if (!problem) throw httpError(404, 'Problem not found');
  if (problem.createdBy?.toString() !== req.user._id.toString()) {
    throw httpError(403, 'Forbidden: only the teacher who created this problem can modify it');
  }
  return problem;
}

// GET /problems/stats/counts  — global + per-topic counts of non-archived
// problems. Declared before '/:id' so it isn't captured as an id.
router.get('/stats/counts', requireAuth, async (_req, res, next) => {
  try {
    const rows = await Problem.aggregate([
      { $match: { archived: { $ne: true } } },
      { $unwind: '$topics' },
      { $group: { _id: '$topics', count: { $sum: 1 } } },
    ]);
    const byTopic = Object.fromEntries(TOPICS.map((t) => [t, 0]));
    for (const row of rows) byTopic[row._id] = row.count;

    const total = await Problem.countDocuments({ archived: { $ne: true } });
    res.json({ total, byTopic });
  } catch (err) {
    next(err);
  }
});

// GET /problems[?topics=a,b][&limit=20&cursor=...]  — list all (non-archived)
// problems; any authenticated user. `topics` is a comma-separated OR filter: a
// problem matches if it has at least one of the given topics.
// Each problem is annotated with a stable `number` ("Problem 1", "Problem 2",
// ...) ranked by creation order across ALL non-archived problems — so a
// problem's number never shifts when a topic filter is applied or the sort
// order changes, and stays stable as new problems are added after it. This
// numbering is computed over every non-archived problem regardless of paging.
// For students, each problem is also annotated with `solved` = they have a
// graded submission that passed every test case.
// Pagination is opt-in: pass `limit` to get a page back (cursor-based, sorted
// by createdAt/_id descending — cheaper at scale than offset/skip) plus a
// `nextCursor` to fetch the next page; omit it to get the full list as before.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const filter = { archived: { $ne: true } };
    if (req.query.topics) {
      const wanted = String(req.query.topics)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (wanted.length) filter.topics = { $in: wanted };
    }

    const allIds = await Problem.find({ archived: { $ne: true } })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean();
    const numberOf = new Map(allIds.map((p, i) => [String(p._id), i + 1]));

    let query = Problem.find(filter).sort({ createdAt: -1, _id: -1 });

    const limit = req.query.limit ? Math.min(Number(req.query.limit) || 0, MAX_PAGE_LIMIT) : null;
    let nextCursor = null;
    if (limit) {
      const cursor = decodeCursor(req.query.cursor);
      if (cursor) query = query.where(cursorFilter(cursor));
      query = query.limit(limit + 1);
    }

    const problems = await query.lean();

    if (limit && problems.length > limit) {
      nextCursor = encodeCursor(problems[limit - 1]);
      problems.length = limit;
    }

    for (const p of problems) p.number = numberOf.get(String(p._id));

    if (viewerKind(req.user) === 'student') {
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

    const body = { problems };
    if (limit) {
      body.nextCursor = nextCursor;
      body.hasMore = Boolean(nextCursor);
    }
    res.json(body);
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
router.post(
  '/',
  requireAuth,
  requireRole('teacher'),
  validate(createProblemSchema),
  async (req, res, next) => {
    try {
      const problem = await Problem.create({
        ...req.body,
        createdBy: req.user._id,
      });
      res.status(201).json({ problem });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /problems/:id  — teacher-only, creator-only. Partial update.
router.patch(
  '/:id',
  requireAuth,
  requireRole('teacher'),
  validate(patchProblemSchema),
  async (req, res, next) => {
    try {
      const problem = await loadOwnedProblem(req);
      Object.assign(problem, req.body);
      await problem.save();
      res.json({ problem });
    } catch (err) {
      next(err);
    }
  }
);

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
