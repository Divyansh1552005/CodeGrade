import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { generalRateLimit } from './rateLimit.js';

/**
 * Verify the access JWT and attach the authenticated user to req.user.
 * The access token is a short-lived Bearer token sent in the Authorization
 * header (held in client memory). The refresh token — the long-lived secret —
 * is the only thing kept in an httpOnly cookie.
 * Rejects with 401 if the token is missing or invalid.
 *
 * Also applies the basic per-user rate limit (see rateLimit.js) here rather
 * than per-route, so every protected route gets it automatically.
 */
export async function requireAuth(req, res, next) {
  let user;
  try {
    const [scheme, headerToken] = (req.headers.authorization || '').split(' ');
    const token = scheme === 'Bearer' ? headerToken : null;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    // Tokens issued before a password reset carry an older version. Missing counts as 0.
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  // Outside the try/catch above: a rate-limit rejection or store error must
  // not be swallowed and reported back as a misleading 401.
  return generalRateLimit(req, res, next);
}
