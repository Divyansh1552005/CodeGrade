import Doubt, { REJECTED, PENDING_TRIAGE } from '../models/Doubt.js';
import Answer from '../models/Answer.js';
import { decodeCursor, encodeCursor, cursorFilter } from '../utils/pagination.js';

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
  if (viewer.role === 'teacher') {
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

/**
 * The board, or with `mine` the viewer's own doubts. Cursor-paginated by default; the
 * legacy own-doubts list stays unpaginated unless it asks for a limit.
 */
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

export async function listDoubts({ viewer, mine = false, status, limit: rawLimit, cursor: rawCursor }) {
  const base = mine ? { studentId: viewer._id } : {};
  const paginate = !mine || rawLimit !== undefined;
  const requested = rawLimit === undefined ? 20 : Number(rawLimit);
  const limit = paginate ? Math.min(Math.max(requested || 20, 1), MAX_PAGE_LIMIT) : null;

  const parsed = limit ? decodeCursor(rawCursor) : null;
  const clauses = [base, visibleFor(viewer)];
  if (status) clauses.push(...(await statusClauses(status)));
  if (parsed) clauses.push(cursorFilter(parsed));
  let query = Doubt.find({ $and: clauses }).sort({ createdAt: -1, _id: -1 });
  if (limit) query = query.limit(limit + 1);

  const doubts = await query.populate('studentId', 'name').lean();
  let nextCursor = null;
  if (limit && doubts.length > limit) {
    nextCursor = encodeCursor(doubts[limit - 1]);
    doubts.length = limit;
  }

  const approvedIds = await Answer.find({ doubtId: { $in: doubts.map((d) => d._id) }, state: 'approved' }).distinct('doubtId');
  const approved = new Set(approvedIds.map(String));
  const presented = doubts.map((d) => ({ ...presentDoubt(d, viewer), hasApprovedAnswer: approved.has(String(d._id)) }));

  const body = { doubts: presented };
  if (limit) {
    body.nextCursor = nextCursor;
    body.hasMore = Boolean(nextCursor);
  }
  return body;
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
