import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Verify the access JWT and attach the authenticated user to req.user.
 * The access token is a short-lived Bearer token sent in the Authorization
 * header (held in client memory). The refresh token — the long-lived secret —
 * is the only thing kept in an httpOnly cookie.
 * Rejects with 401 if the token is missing or invalid.
 */
export async function requireAuth(req, res, next) {
  try {
    const [scheme, headerToken] = (req.headers.authorization || '').split(' ');
    const token = scheme === 'Bearer' ? headerToken : null;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
