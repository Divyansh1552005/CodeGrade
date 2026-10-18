import AuditLog from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

const SECRET_KEY = /pass|token|secret|hash|otp|totp|code/i;
const clean = (value) => {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)));
};
const who = (user) => (user ? { id: user._id ?? user.id ?? undefined, email: user.email } : {});

function context(req) {
  return { ip: req?.ip ? String(req.ip).slice(0, 64) : undefined, userAgent: req?.get?.('user-agent')?.slice(0, 200) };
}

/**
 * Append one audit row. `actor` and `target` are users (or null); only their id and an email snapshot are
 * kept. `before` and `after` are small objects such as { role } and are stripped of anything that looks
 * like a secret. Errors propagate: an admin action that cannot be recorded should not be reported as done.
 */
export function audit({ action, actor, target, before, after, detail, req }) {
  const a = who(actor);
  const t = who(target);
  return AuditLog.create({
    action, actorId: a.id, actorEmail: a.email, targetId: t.id, targetEmail: t.email,
    before: clean(before), after: clean(after), detail: detail ? String(detail).slice(0, 240) : undefined, ...context(req),
  });
}

/**
 * Failed admin logins would let an attacker fill the log, so repeated failures from one IP within the same
 * minute share a row and only its `count` goes up. This increments a counter and nothing else.
 * It never throws: a logging problem must not change the login response.
 */
export async function auditCoalesced({ action, target, req, detail, bucketMs = 60000 }) {
  try {
    const { ip, userAgent } = context(req);
    const bucket = Math.floor(Date.now() / bucketMs);
    const t = who(target);
    await AuditLog.collection.updateOne(
      { coalesceKey: `${action}:${ip ?? 'unknown'}:${bucket}` },
      {
        $setOnInsert: { action, targetId: t.id, targetEmail: t.email, ip, userAgent, detail: detail ? String(detail).slice(0, 240) : undefined, createdAt: new Date() },
        $set: { lastAt: new Date() },
        $inc: { count: 1 },
      },
      { upsert: true },
    );
  } catch (err) {
    logger.warn('audit.coalesced_failed', { action, error: err.message });
  }
}
