import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { generalRateLimit } from './rateLimit.js';
import TeacherApplication from '../models/TeacherApplication.js';
import { ALL_ROLES, APP_ROLES, ROLES } from '../utils/roles.js';

/**
 * Verify the access JWT, load the user from the database and attach it to req.user.
 *
 * The role is always the one stored in the database at the time of the request. The token only identifies
 * the user (and carries a version that a password reset or a role change raises), so a demotion, a
 * suspension or a revoked session takes effect on the very next request.
 *
 * Deny by default: `roles` lists who may pass. `requireAuth` lets only students and teachers in, so a
 * route that forgets a role check is still closed to a teacher applicant, an admin or an unknown role.
 * Routes that must accept others opt in with requireAnyAuth.
 *
 * Also applies the basic per-user rate limit (see rateLimit.js) here rather than per-route, so every
 * protected route gets it automatically.
 */
export function authenticate({ roles }) {
  return async function authMiddleware(req, res, next) {
    let user;
    try {
      const [scheme, headerToken] = (req.headers.authorization || '').split(' ');
      const token = scheme === 'Bearer' ? headerToken : null;

      if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
      user = await User.findById(payload.sub).select('-passwordHash');
      if (!user) {
        return res.status(401).json({ error: 'User no longer exists' });
      }
      // Tokens issued before a password reset or role change carry an older version. Missing counts as 0.
      if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (user.suspendedAt) {
      return res.status(403).json({ error: 'This account is suspended.', code: 'ACCOUNT_SUSPENDED' });
    }
    if (!roles.includes(user.role)) {
      if (user.role === ROLES.TEACHER_APPLICANT) {
        const application = await TeacherApplication.findOne({ userId: user._id }).select('status decisionReason').lean();
        return res.status(403).json({
          error: 'Your teacher account is awaiting approval.', code: 'TEACHER_PENDING',
          applicationStatus: application?.status ?? 'pending',
          ...(application?.status === 'rejected' && application.decisionReason ? { reason: application.decisionReason } : {}),
        });
      }
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' });
    }

    req.user = user;
    // Outside the try/catch above: a rate-limit rejection or store error must
    // not be swallowed and reported back as a misleading 401.
    return generalRateLimit(req, res, next);
  };
}

/** Students and teachers: every product route. */
export const requireAuth = authenticate({ roles: APP_ROLES });
/** Any signed-in role, for the few routes that must work for an applicant or the admin too (GET /auth/me). */
export const requireAnyAuth = authenticate({ roles: ALL_ROLES });
