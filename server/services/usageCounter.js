import UsageCounter from '../models/UsageCounter.js';
import { dayKey, nextResetAt } from '../utils/istDay.js';

const KEEP_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Atomically take one unit from a per-day cap. Returns { allowed, count, resetAt }.
 * A blocked call changes nothing. Parallel calls can never push the count past `max`:
 * the conditional update is a single atomic operation, and a lost first-insert race
 * is retried as a plain conditional increment.
 */
export async function consumeDaily({ userId, kind, max, now = Date.now() }) {
  const day = dayKey(now);
  const resetAt = nextResetAt(now);
  const expiresAt = new Date(resetAt.getTime() + KEEP_MS);
  const filter = { userId, kind, day, count: { $lt: max } };
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt } };
  let doc;
  try {
    doc = await UsageCounter.findOneAndUpdate(filter, update, { upsert: true, new: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Either the cap is reached (the insert collided with the full row) or two first
    // requests raced. A second conditional increment tells them apart.
    doc = await UsageCounter.findOneAndUpdate(filter, update, { new: true });
  }
  return { allowed: Boolean(doc), count: doc?.count ?? max, resetAt };
}
