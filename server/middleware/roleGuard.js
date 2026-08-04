/**
 * Restrict a route to one or more roles. Must run after requireAuth.
 * Responds 403 if the authenticated user's role is not permitted.
 */
export function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      const allowed = roles.join(' or ');
      return res.status(403).json({
        error: `Forbidden: this action is restricted to ${allowed} accounts`,
      });
    }
    return next();
  };
}
