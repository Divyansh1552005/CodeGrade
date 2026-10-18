import crypto from 'node:crypto';
import EmailToken from '../models/EmailToken.js';
import { mailConfig } from '../config/mail.js';

// The raw token is HMAC(EMAIL_TOKEN_SECRET, tokenId), where tokenId is 32 random bytes. Only the token's
// SHA-256 and the tokenId are stored, so no database row or job payload contains a usable token: the worker
// recomputes it when it builds the link. Both processes must therefore share EMAIL_TOKEN_SECRET.
const PATHS = { verify: '/verify-email', reset: '/reset-password' };
const TTL_KEY = { verify: 'verifyTtlMs', reset: 'resetTtlMs' };
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const deriveToken = (tokenId) => crypto.createHmac('sha256', mailConfig().tokenSecret).update(tokenId).digest('base64url');
export const ttlFor = (type) => mailConfig()[TTL_KEY[type]];

/** The frontend link for a token. Always built from APP_BASE_URL, never from a request header. */
export function tokenLink(type, tokenId) {
  return `${mailConfig().baseUrl}${PATHS[type]}?token=${deriveToken(tokenId)}`;
}

/** Mark every outstanding token of this kind for the user as replaced, except `exceptId`. */
export function supersedeTokens(userId, type, exceptId) {
  const filter = { userId, type, usedAt: { $exists: false }, supersededAt: { $exists: false } };
  if (exceptId) filter._id = { $ne: exceptId };
  return EmailToken.updateMany(filter, { $set: { supersededAt: new Date() } });
}

/** Create a token, then retire the older ones, so there is never a moment with no valid link. Returns its tokenId. */
export async function issueToken(userId, type) {
  const tokenId = crypto.randomBytes(32).toString('hex');
  const created = await EmailToken.create({
    userId, type, tokenId, tokenHash: hashToken(deriveToken(tokenId)), expiresAt: new Date(Date.now() + ttlFor(type)),
  });
  await supersedeTokens(userId, type, created._id);
  return tokenId;
}

/**
 * Atomically use a token: one findOneAndUpdate matches an unused, unsuperseded, unexpired token and marks
 * it used, so two parallel requests cannot both succeed. Returns the token document or null.
 */
export async function consumeToken(token, type) {
  if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return null;
  const hash = hashToken(token);
  const doc = await EmailToken.findOneAndUpdate(
    { tokenHash: hash, type, usedAt: { $exists: false }, supersededAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true },
  );
  if (!doc) return null;
  const a = Buffer.from(doc.tokenHash);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? doc : null;
}

/** True while a token can still be used. The email job checks this so a stale job sends nothing. */
export async function isTokenActive(userId, type, tokenId) {
  const doc = await EmailToken.findOne({ userId, type, tokenId });
  return Boolean(doc && !doc.usedAt && !doc.supersededAt && doc.expiresAt > new Date());
}

/**
 * Per-account send limits, read from the token rows (so they hold even when Redis is down): a new token
 * is allowed once the cooldown has passed and fewer than the hourly cap were issued in the last hour.
 */
export async function mayIssue(userId, type, { ignoreCooldown = false } = {}) {
  const { resendCooldownMs, resendHourlyCap } = mailConfig();
  const now = Date.now();
  if (!ignoreCooldown) {
    const latest = await EmailToken.findOne({ userId, type }).sort({ createdAt: -1 });
    if (latest && now - latest.createdAt.getTime() < resendCooldownMs) return false;
  }
  const lastHour = await EmailToken.countDocuments({ userId, type, createdAt: { $gt: new Date(now - 3600 * 1000) } });
  return lastHour < resendHourlyCap;
}
