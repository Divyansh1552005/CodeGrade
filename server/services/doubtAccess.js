import { viewerKind } from '../utils/roles.js';
import Doubt, { REJECTED, PENDING_TRIAGE } from '../models/Doubt.js';
import Answer from '../models/Answer.js';
import Problem from '../models/Problem.js';
import { encodeCursor, cursorFilter } from '../utils/pagination.js';
import { makePreview } from '../utils/preview.js';

// The single place that decides which doubts a viewer may see. Routes never build
// a Doubt filter themselves. (The Doubt model also hides auto_rejected doubts from
// every read by default, as a second line of defence.)
export const MAX_PAGE_LIMIT = 100;

/**
 * Doubts a viewer may see, as a deny-list so doubts without a status stay visible:
 *  - never auto_rejected (also enforced by the model's default scope);
 *  - pending_triage only to the student who wrote it.
 */
export function visibleFor(viewer) {
  return {
    $or: [
      { status: { $nin: [REJECTED, PENDING_TRIAGE] } },
      { status: PENDING_TRIAGE, studentId: viewer._id },
    ],
  };
}

/** What a viewer may see of a doubt. Triage internals and appeal data are teacher-only. */
export function presentDoubt(doubt, viewer) {
  const out = typeof doubt.toObject === 'function' ? doubt.toObject() : { ...doubt };
  if (viewerKind(viewer) === 'teacher') {
    out.appealed = out.status === 'appealed';
    if (out.triage) out.triage = { lowConfidence: Boolean(out.triage.lowConfidence) };
    delete out.appeal;
  } else {
    delete out.triage;
    delete out.appeal;
    // Other students must not learn that a doubt was ever removed and appealed.
    if (out.status === 'appealed') out.status = 'pending_review';
  }
  return out;
}

// Board status filters. They match the labels students see: Answered, Awaiting review (an AI draft is
// with a teacher) and Awaiting teacher (no AI draft, a teacher has to answer it by hand).
export const STATUS_FILTERS = ['answered', 'awaiting_review', 'awaiting_teacher'];

async function statusClauses(status) {
  const answered = await Answer.find({ state: 'approved' }).distinct('doubtId');
  if (status === 'answered') return [{ _id: { $in: answered } }];
  return [
    { _id: { $nin: answered } },
    { status: { $ne: PENDING_TRIAGE } },
    status === 'awaiting_teacher'
      ? { aiDraftStatus: { $in: ['failed', 'skipped'] } }
      : { aiDraftStatus: { $nin: ['failed', 'skipped', 'irrelevant'] } },
  ];
}

const LIST_FIELDS = 'title body studentId problemId status aiDraftStatus createdAt triage.lowConfidence';

/**
 * One page of the board, or with `mine` the viewer's own doubts. Keyset paging on (createdAt, _id).
 * `limit` and `cursor` are already validated by the route (default 10, at most 50). Rows are light:
 * a plain-text `preview` (at most 160 characters) replaces the body, and there is no code snippet;
 * GET /doubts/:id returns the full doubt. Every visibility rule lives in visibleFor above, so the
 * Profile list and the board can never disagree about which doubts exist.
 */
export async function listDoubts({ viewer, mine = false, status, limit = 10, cursor }) {
  const size = Math.min(Math.max(Number(limit) || 10, 1), MAX_PAGE_LIMIT);
  const clauses = [mine ? { studentId: viewer._id } : {}, visibleFor(viewer)];
  if (status) clauses.push(...(await statusClauses(status)));
  if (cursor) clauses.push(cursorFilter(cursor));

  const rows = await Doubt.find({ $and: clauses })
    .sort({ createdAt: -1, _id: -1 })
    .limit(size + 1)
    .select(LIST_FIELDS)
    .populate('studentId', 'name')
    .lean();
  const hasMore = rows.length > size;
  if (hasMore) rows.length = size;

  const [approvedIds, problems] = await Promise.all([
    Answer.find({ doubtId: { $in: rows.map((d) => d._id) }, state: 'approved' }).distinct('doubtId'),
    Problem.find({ _id: { $in: [...new Set(rows.filter((d) => d.problemId).map((d) => String(d.problemId)))] } }).select('title').lean(),
  ]);
  const approved = new Set(approvedIds.map(String));
  const titles = new Map(problems.map((p) => [String(p._id), p.title]));

  const doubts = rows.map((d) => {
    const item = { ...presentDoubt(d, viewer), hasApprovedAnswer: approved.has(String(d._id)), preview: makePreview(d.body) };
    delete item.body;
    if (d.problemId) { item.problemId = String(d.problemId); item.problemTitle = titles.get(String(d.problemId)) ?? null; }
    return item;
  });
  return { doubts, nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null, hasMore };
}

/** One doubt the viewer may see, or null (the route answers 404 either way). */
export async function findVisibleDoubt(id, viewer) {
  return Doubt.findOne({ $and: [{ _id: id }, visibleFor(viewer)] }).populate('studentId', 'name');
}

/** Teacher view: doubts with no usable AI draft that still have no answer. */
export async function listManualAnswerQueue(viewer) {
  const failed = await Doubt.find({ $and: [{ aiDraftStatus: { $in: ['failed', 'irrelevant', 'skipped'] } }, visibleFor(viewer)] })
    .sort({ createdAt: -1 })
    .populate('studentId', 'name');
  const answeredIds = await Answer.find({ doubtId: { $in: failed.map((d) => d._id) } }).distinct('doubtId');
  const answered = new Set(answeredIds.map(String));
  return failed.filter((d) => !answered.has(String(d._id)));
}

/** Populate options for answer queues: the doubt must be visible to the viewer, otherwise it is null. */
export function populateVisibleDoubt(viewer) {
  return { path: 'doubtId', select: 'title body studentId status triage.lowConfidence', match: visibleFor(viewer) };
}

/** Answers whose doubt the viewer cannot see are dropped from a populated list. */
export function withVisibleDoubts(answers, viewer) {
  return answers
    .filter((a) => a.doubtId)
    .map((a) => {
      const answer = a.toObject();
      answer.doubtId = presentDoubt(answer.doubtId, viewer);
      return answer;
    });
}

// ---- The owner's "removed" page and the appeal. These are the only reads that opt in to
// ---- seeing auto-rejected doubts, and they only ever return the author's own doubt.

const REMOVED_STATES = ['auto_rejected', 'appealed'];

/** The author's own removed (or appealed) doubt. null for anyone else, or any other doubt. */
export function findRemovedForOwner(id, ownerId) {
  return Doubt.findOne({ _id: id, studentId: ownerId, status: { $in: REMOVED_STATES } }).setOptions({ includeRemoved: true });
}

/** What the student may see on the removed page: the reason and what they can do next. Never the verdict, confidence or model. */
export function presentRemoved(doubt) {
  return {
    id: String(doubt._id),
    title: doubt.title,
    body: doubt.body,
    createdAt: doubt.createdAt,
    status: doubt.status,
    reason: doubt.triage?.reason || 'It did not look like a question about programming.',
    offTopic: doubt.triage?.verdict !== 'spam_or_abusive',
    removedBy: doubt.triage?.source === 'teacher' ? 'teacher' : 'ai',
    // True once the one appeal was used, including when a teacher then removed the doubt again.
    appealUsed: Boolean(doubt.appeal?.requestedAt),
    appealed: doubt.status === 'appealed',
    canAppeal: doubt.status === 'auto_rejected' && !doubt.appeal?.requestedAt,
  };
}

/**
 * One appeal per doubt, owner only, as a single atomic transition. Returns
 * { doubt } on success, { already: true } when it was appealed before, or null when the
 * doubt is not the caller's removed doubt.
 */
export async function requestAppeal(id, ownerId) {
  const doubt = await Doubt.findOneAndUpdate(
    { _id: id, studentId: ownerId, status: REJECTED, 'appeal.requestedAt': { $exists: false } },
    // No AI draft for an appeal: skipping it sends the doubt straight to the teachers' manual queue.
    { $set: { status: 'appealed', 'appeal.requestedAt': new Date(), aiDraftStatus: 'skipped' } },
    { new: true }
  );
  if (doubt) return { doubt };
  const existing = await findRemovedForOwner(id, ownerId);
  return existing ? { already: true } : null;
}
