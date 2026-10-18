import { viewerKind } from '../utils/roles.js';
import Submission from '../models/Submission.js';
import Problem from '../models/Problem.js';
import { encodeCursor, cursorFilter } from '../utils/pagination.js';

// What a list row needs, and nothing else. Source code, per-test results, AI feedback and the
// grading snapshot stay out of lists; GET /submissions/:id returns them when a row is opened.
const LIST_FIELDS = '_id studentId problemId language status passCount totalCount feedbackStatus createdAt';

/**
 * Newest-first page of submissions. Students only ever get their own; teachers get everyone's, as
 * before, but bounded the same way. Keyset paging on (createdAt, _id) so a new submission arriving
 * while someone is paging never shifts or repeats a row on a page they already have.
 * A student's list for one problem also carries `total` (an index-only count of that one
 * student's attempts on that one problem), because the workspace tab shows how many attempts exist.
 */
export async function listSubmissions({ viewer, problemId, limit, cursor }) {
  const teacher = viewerKind(viewer) === 'teacher';
  const scope = teacher ? {} : { studentId: viewer._id };
  if (problemId) scope.problemId = problemId;

  const clauses = [scope];
  if (cursor) clauses.push(cursorFilter(cursor));
  const rows = await Submission.find({ $and: clauses })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .select(LIST_FIELDS)
    .lean();

  const hasMore = rows.length > limit;
  if (hasMore) rows.length = limit;

  const titles = new Map((await Problem.find({ _id: { $in: [...new Set(rows.map((r) => String(r.problemId)))] } }).select('title').lean())
    .map((p) => [String(p._id), p.title]));
  const submissions = rows.map((r) => ({
    _id: r._id,
    problemId: String(r.problemId),
    problemTitle: titles.get(String(r.problemId)) ?? null,
    language: r.language,
    status: r.status,
    passCount: r.passCount,
    totalCount: r.totalCount,
    feedbackStatus: r.feedbackStatus,
    createdAt: r.createdAt,
    ...(teacher ? { studentId: r.studentId } : {}),
  }));

  const body = { submissions, nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null, hasMore };
  if (!teacher && problemId) body.total = await Submission.countDocuments({ studentId: viewer._id, problemId });
  return body;
}
