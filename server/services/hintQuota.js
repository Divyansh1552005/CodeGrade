import mongoose from 'mongoose';
import HintQuota from '../models/HintQuota.js';
import { aiLimits } from '../config/aiLimits.js';
import { dayKey, nextResetAt } from '../utils/istDay.js';

// Hint chat limits, enforced atomically in MongoDB (not Redis): the existing Redis rate
// limiter fails open, which is wrong for a cost cap, and a single document lets both limits
// be checked and consumed in ONE operation, so parallel requests cannot exceed either of them
// and a rejected request consumes nothing. If MongoDB is unreachable the call fails and no
// AI request is made (fail closed).
//
// Two limits: a daily total of messages across all problems (no per-problem cap), and a rolling
// per-minute window.
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;
const oid = (value) => new mongoose.Types.ObjectId(String(value));

const sameDay = (today) => ({ $eq: ['$day', today] });
const field = (name, fallback) => ({ $ifNull: [`$${name}`, fallback] });
const inWindow = (cutoff) => ({ $filter: { input: field('recent', []), cond: { $gt: ['$$this', cutoff] } } });

/** What is left today. `now` is injectable for tests. */
function snapshot(doc, { now } = {}) {
  const { hints } = aiLimits();
  const today = dayKey(now);
  const messages = doc && doc.day === today ? doc.messages ?? 0 : 0;
  const cutoff = now - hints.windowSeconds * 1000;
  const recent = (doc?.recent ?? []).filter((t) => t > cutoff).sort((a, b) => a - b);
  const windowFull = recent.length >= hints.maxMessagesPerWindow;
  const retryAfterSeconds = windowFull
    ? Math.max(1, Math.ceil((recent[recent.length - hints.maxMessagesPerWindow] + hints.windowSeconds * 1000 - now) / 1000))
    : 0;
  return {
    messagesLeft: Math.max(0, hints.maxMessagesPerDay - messages),
    resetAt: nextResetAt(now),
    retryAfterSeconds,
  };
}

export async function getQuota({ userId, now = Date.now() }) {
  const doc = await HintQuota.collection.findOne({ userId: oid(userId) });
  return snapshot(doc, { now });
}

function classifyBlock(doc, { now }) {
  const quota = snapshot(doc, { now });
  return { limit: quota.messagesLeft <= 0 ? 'daily_messages' : 'rate', quota };
}

/**
 * Atomically check both limits (daily messages, per-minute) and, only if both pass, consume a
 * message. Returns { ok: true, attemptId, day, quota } or { ok: false, limit, quota }.
 */
export async function reserve({ userId, problemId, now = Date.now() }) {
  const { hints } = aiLimits();
  const today = dayKey(now);
  const cutoff = now - hints.windowSeconds * 1000;
  const problem = oid(problemId);
  const attemptId = new mongoose.Types.ObjectId();
  const user = oid(userId);

  const filter = {
    userId: user,
    $expr: {
      $and: [
        { $lt: [{ $cond: [sameDay(today), field('messages', 0), 0] }, hints.maxMessagesPerDay] },
        { $lt: [{ $size: inWindow(cutoff) }, hints.maxMessagesPerWindow] },
      ],
    },
  };
  const pipeline = [
    // 1. Start a new day: the daily counters reset, and expired window entries drop out.
    { $set: {
      messages: { $cond: [sameDay(today), field('messages', 0), 0] },
      ledger: { $cond: [sameDay(today), field('ledger', []), []] },
      refunds: { $cond: [sameDay(today), field('refunds', 0), 0] },
      recent: inWindow(cutoff),
      day: today,
    } },
    // 2. Consume.
    { $set: {
      messages: { $add: ['$messages', 1] },
      recent: { $concatArrays: ['$recent', [now]] },
      ledger: { $concatArrays: ['$ledger', [{ id: attemptId, problemId: problem, at: now, day: today, refunded: false }]] },
      expiresAt: new Date(now + KEEP_MS),
    } },
  ];

  // MongoDB does not allow $expr in an upsert filter, so the limits are checked on an
  // existing document. A first-ever user gets an empty document created (idempotent, safe
  // under races because userId is unique) and the conditional update is retried. A request is
  // reported as blocked only when the stored counters really are at a limit; if they are not
  // (we only lost a race with the document being created), it is tried again.
  const attempt = () => wrap(HintQuota.collection.findOneAndUpdate(filter, pipeline, { returnDocument: 'after' }));
  let doc;
  for (let tries = 0; tries < 5 && !doc; tries += 1) {
    ({ value: doc } = await attempt());
    if (doc) break;
    const current = await HintQuota.collection.findOne({ userId: user });
    if (!current) {
      try {
        await HintQuota.collection.updateOne({ userId: user }, { $setOnInsert: { userId: user, messages: 0, recent: [], refunds: 0, ledger: [] } }, { upsert: true });
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
      continue;
    }
    const view = snapshot(current, { now });
    if (view.messagesLeft <= 0 || view.retryAfterSeconds > 0 || tries === 4) return { ok: false, ...classifyBlock(current, { now }) };
  }
  if (!doc) return { ok: false, ...classifyBlock(await HintQuota.collection.findOne({ userId: user }), { now }) };
  return { ok: true, attemptId: String(attemptId), day: today, quota: snapshot(doc, { now }) };
}

// The driver returns the document directly in v6 and { value } in older versions.
async function wrap(promise) {
  const result = await promise;
  if (result && Object.prototype.hasOwnProperty.call(result, 'value') && Object.prototype.hasOwnProperty.call(result, 'ok')) return result;
  return { value: result };
}

/**
 * Give back one reserved message. Idempotent: a repeat call, an unknown attempt, an attempt from
 * an earlier day or a spent daily refund cap does nothing. It does NOT free the per-minute slot,
 * because the AI call was made. Returns { refunded, reason, quota }.
 */
export async function refund({ userId, attemptId, day, now = Date.now() }) {
  const { hints } = aiLimits();
  const attempt = oid(attemptId);
  const user = oid(userId);
  const filter = {
    userId: user,
    day,
    ledger: { $elemMatch: { id: attempt, refunded: false } },
    $expr: { $lt: [field('refunds', 0), hints.refundCapPerDay] },
  };
  const pipeline = [{ $set: {
    ledger: { $map: { input: '$ledger', as: 'e', in: {
      $cond: [{ $eq: ['$$e.id', attempt] }, { $mergeObjects: ['$$e', { refunded: true }] }, '$$e'],
    } } },
    messages: { $max: [0, { $subtract: [field('messages', 0), 1] }] },
    refunds: { $add: [field('refunds', 0), 1] },
  } }];
  const { value: doc } = await wrap(HintQuota.collection.findOneAndUpdate(filter, pipeline, { returnDocument: 'after' }));
  if (doc) return { refunded: true, quota: snapshot(doc, { now }) };

  const current = await HintQuota.collection.findOne({ userId: user });
  const entry = current?.ledger?.find((e) => String(e.id) === String(attempt));
  let reason = 'unknown_attempt';
  if (entry?.refunded) reason = 'already_refunded';
  else if (entry && current.day === day && (current.refunds ?? 0) >= hints.refundCapPerDay) reason = 'cap_reached';
  else if (entry) reason = 'day_changed';
  return { refunded: false, reason, quota: snapshot(current, { now }) };
}
