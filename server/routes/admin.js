import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { objectId, pageQuerySchema } from '../validation/schemas.js';
import { parseCursor } from '../utils/pagination.js';
import { ALL_ROLES } from '../utils/roles.js';
import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { listApplications, listAudit, listUsers } from '../services/adminLists.js';
import { approveApplication, changeRole, rejectApplication, setSuspended } from '../services/adminActions.js';

const router = Router();

// Everything here is for the admin only. Anyone else gets the same 404 as an unknown route.
router.use(requireAdmin);

const idParams = z.object({ id: objectId });
const usersQuery = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ALL_ROLES).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});
const applicationsQuery = pageQuerySchema.extend({ status: z.enum(['pending', 'approved', 'rejected']).default('pending') });
const auditQuery = pageQuerySchema.extend({ action: z.enum(AUDIT_ACTIONS).optional() });
const roleBody = z.object({ role: z.enum(['student', 'teacher']) }).strict();
const rejectBody = z.object({ reason: z.string().max(240).optional() }).strict();
const emptyBody = z.object({}).strict();

const handler = (fn) => async (req, res, next) => {
  try { res.json(await fn(req)); } catch (err) { next(err); }
};

// GET /admin/users?q=&role=&status=&limit=&cursor=
router.get('/users', validate(usersQuery, 'query'), handler((req) => listUsers({ ...req.query, cursor: parseCursor(req.query.cursor) })));

// POST /admin/users/:id/role  { role: "student" | "teacher" }
router.post('/users/:id/role', validate(idParams, 'params'), validate(roleBody), handler(async (req) => ({
  user: (await changeRole({ admin: req.user, id: req.params.id, role: req.body.role, req })).toJSON(),
})));

router.post('/users/:id/suspend', validate(idParams, 'params'), validate(emptyBody), handler(async (req) => ({
  user: (await setSuspended({ admin: req.user, id: req.params.id, suspended: true, req })).toJSON(),
})));
router.post('/users/:id/unsuspend', validate(idParams, 'params'), validate(emptyBody), handler(async (req) => ({
  user: (await setSuspended({ admin: req.user, id: req.params.id, suspended: false, req })).toJSON(),
})));

// GET /admin/teacher-applications?status=pending
router.get('/teacher-applications', validate(applicationsQuery, 'query'), handler((req) => listApplications({ ...req.query, cursor: parseCursor(req.query.cursor) })));
router.post('/teacher-applications/:id/approve', validate(idParams, 'params'), validate(emptyBody), handler(async (req) => ({
  application: await approveApplication({ admin: req.user, id: req.params.id, req }),
})));
router.post('/teacher-applications/:id/reject', validate(idParams, 'params'), validate(rejectBody), handler(async (req) => ({
  application: await rejectApplication({ admin: req.user, id: req.params.id, reason: req.body.reason, req }),
})));

// GET /admin/audit-log?action=&limit=&cursor=
router.get('/audit-log', validate(auditQuery, 'query'), handler((req) => listAudit({ ...req.query, cursor: parseCursor(req.query.cursor) })));

export default router;
