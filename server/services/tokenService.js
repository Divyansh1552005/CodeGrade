import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import RefreshToken from '../models/RefreshToken.js';
import User from '../models/User.js';

const ACCESS_SECRET = () => process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRY = () => process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = () => process.env.JWT_REFRESH_EXPIRY || '7d';

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function unauthorized(message) {
  const err = new Error(message);
  err.status = 401;
  return err;
}

/** Short-lived access JWT used on every authenticated request (Bearer). */
export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), tv: user.tokenVersion ?? 0 }, ACCESS_SECRET(), {
    expiresIn: ACCESS_EXPIRY(),
  });
}

/**
 * Issue a new refresh token: a JWT signed with the refresh secret, carrying a
 * unique jti. We persist only the jti's hash so the token is revocable (for
 * rotation, logout, and reuse detection). Returns the signed JWT string.
 */
export async function issueRefreshToken(userId, tokenVersion = 0) {
  const jti = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign({ sub: userId.toString(), jti, tv: tokenVersion }, REFRESH_SECRET(), {
    expiresIn: REFRESH_EXPIRY(),
  });
  const { exp } = jwt.decode(token);
  await RefreshToken.create({
    userId,
    tokenHash: hash(jti),
    expiresAt: new Date(exp * 1000),
  });
  return token;
}

/** Convenience: mint both tokens for a user (login / register). */
export async function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user._id, user.tokenVersion ?? 0);
  return { accessToken, refreshToken };
}

// Verify a refresh JWT and return its decoded payload, or throw 401.
function verifyRefresh(rawToken) {
  if (!rawToken) throw unauthorized('Refresh token required');
  try {
    return jwt.verify(rawToken, REFRESH_SECRET());
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }
}

/**
 * Rotate a refresh token: verify the JWT, look up its jti record, revoke it
 * (single-use), and issue a fresh pair. Replaying an already-revoked token is
 * treated as compromise and revokes the user's whole token family.
 */
export async function rotateRefreshToken(rawToken, userLookup) {
  const payload = verifyRefresh(rawToken);
  const record = await RefreshToken.findOne({ tokenHash: hash(payload.jti) });

  if (!record) throw unauthorized('Invalid refresh token');

  if (record.revokedAt) {
    // Reuse detected: kill every active token for this user.
    await RefreshToken.updateMany(
      { userId: record.userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );
    throw unauthorized('Refresh token reuse detected; sessions revoked');
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw unauthorized('Expired refresh token');
  }

  record.revokedAt = new Date();
  await record.save();

  const user = await userLookup(record.userId);
  if (!user) throw unauthorized('User no longer exists');
  if (user.suspendedAt) throw unauthorized('Account suspended');
  // A password reset raised the user's version after this token was issued.
  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) throw unauthorized('Session ended; log in again');

  return issueTokenPair(user);
}

/** Revoke a specific refresh token (logout). Silent if unknown/invalid. */
export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  let payload;
  try {
    payload = jwt.verify(rawToken, REFRESH_SECRET());
  } catch {
    return; // nothing to revoke for an unverifiable token
  }
  await RefreshToken.updateOne(
    { tokenHash: hash(payload.jti) },
    { $set: { revokedAt: new Date() } }
  );
}

/** Revoke every refresh token of a user and make their access tokens invalid (password reset). */
export async function revokeAllSessions(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await RefreshToken.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
}
