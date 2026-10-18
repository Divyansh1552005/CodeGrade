import Notification from '../models/Notification.js';
import { decodeCursor, encodeCursor, cursorFilter } from '../utils/pagination.js';

export const NOTIFICATION_TTL_DAYS = 90;
// Old grading notifications that are no longer shown anywhere.
const VISIBLE = { key: { $not: /^submission-/ } };

/** API shape. Rows created before the type/title/body fields fall back to message and href. */
export function toApi(n) {
  return {
    id: String(n._id),
    type: n.type || 'answer',
    title: n.title || n.message,
    body: n.body || '',
    link: n.href,
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  };
}

/** Create a notification once per key. A repeat call with the same key changes nothing. */
export async function createNotification({ key, userId, type, title, body = '', link, ttlDays = NOTIFICATION_TTL_DAYS }) {
  const values = {
    key, userId, type, title, body, href: link,
    message: body ? `${title}: ${body}` : title,
    expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
  };
  try {
    await Notification.updateOne({ key }, { $setOnInsert: values }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  return Notification.findOne({ key });
}

export async function listNotifications(userId, { limit = 20, cursor } = {}) {
  const parsed = decodeCursor(cursor);
  const rows = await Notification.find({ userId, ...VISIBLE, ...(parsed ? cursorFilter(parsed) : {}) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = rows.length > limit;
  if (hasMore) rows.length = limit;
  return {
    notifications: rows.map(toApi),
    nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null,
    hasMore,
  };
}

export function unreadCount(userId) {
  return Notification.countDocuments({ userId, ...VISIBLE, readAt: null });
}

/** Mark one of the user's own notifications read. Returns null when it is not theirs or does not exist. */
export async function markRead(userId, id) {
  const updated = await Notification.findOneAndUpdate(
    { _id: id, userId, ...VISIBLE, readAt: null }, { $set: { readAt: new Date() } }, { new: true }
  ).lean();
  if (updated) return toApi(updated);
  const existing = await Notification.findOne({ _id: id, userId, ...VISIBLE }).lean();
  return existing ? toApi(existing) : null;
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany({ userId, ...VISIBLE, readAt: null }, { $set: { readAt: new Date() } });
  return result.modifiedCount;
}
