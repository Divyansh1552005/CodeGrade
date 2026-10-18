import User from '../models/User.js';
import TeacherApplication from '../models/TeacherApplication.js';
import AuditLog from '../models/AuditLog.js';
import { cursorFilter, encodeCursor } from '../utils/pagination.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pages are always newest first on (createdAt, _id), the same keyset paging as the other lists.
async function page(model, filter, { limit, cursor }, select, decorate = (rows) => rows) {
  const clauses = [filter];
  if (cursor) clauses.push(cursorFilter(cursor));
  const rows = await model.find({ $and: clauses }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).select(select).lean();
  const hasMore = rows.length > limit;
  if (hasMore) rows.length = limit;
  return { items: await decorate(rows), nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null, hasMore };
}

/**
 * Light user rows for the admin Users page. `q` matches the start of the email or of the name (the email
 * match uses the index; the name match scans, which is fine for an admin-only list that is limited per page).
 */
export async function listUsers({ limit, cursor, q, role, status }) {
  const filter = {};
  if (role) filter.role = role;
  if (status === 'suspended') filter.suspendedAt = { $exists: true };
  if (status === 'active') filter.suspendedAt = { $exists: false };
  if (q) {
    const start = escapeRegex(q);
    filter.$or = [{ email: { $regex: `^${escapeRegex(q.toLowerCase())}` } }, { name: { $regex: `^${start}`, $options: 'i' } }];
  }
  const { items, nextCursor, hasMore } = await page(
    User, filter, { limit, cursor }, 'name email role emailVerified suspendedAt teacherApprovedAt envAdmin createdAt lastLoginAt',
    async (rows) => {
      const applicantIds = rows.filter((u) => u.role === 'teacher_applicant').map((u) => u._id);
      const applications = applicantIds.length ? await TeacherApplication.find({ userId: { $in: applicantIds } }).select('userId status').lean() : [];
      const statusOf = new Map(applications.map((a) => [String(a.userId), a.status]));
      return rows.map((u) => ({
        _id: u._id, name: u.name, email: u.email, role: u.role, emailVerified: u.emailVerified !== false,
        status: u.suspendedAt ? 'suspended' : 'active',
        // A teacher nobody approved: from before approval existed. The admin reviews these by hand.
        legacy: u.role === 'teacher' && !u.teacherApprovedAt,
        isAdmin: u.role === 'admin',
        ...(u.role === 'teacher_applicant' ? { applicationStatus: statusOf.get(String(u._id)) ?? 'pending' } : {}),
        createdAt: u.createdAt, lastLoginAt: u.lastLoginAt ?? null,
      }));
    },
  );
  return { users: items, nextCursor, hasMore };
}

/** One account with what they gave when they applied to teach (any status), for the admin's profile view. */
export async function userProfile(id) {
  const u = await User.findById(id).select('name email role emailVerified suspendedAt teacherApprovedAt createdAt lastLoginAt').lean();
  if (!u) return null;
  const a = await TeacherApplication.findOne({ userId: u._id }).select('status organization note degree degreeLink proofLinks visibleAt decidedAt decisionReason createdAt').lean();
  return {
    user: {
      _id: u._id, name: u.name, email: u.email, role: u.role, emailVerified: u.emailVerified !== false, status: u.suspendedAt ? 'suspended' : 'active',
      legacy: u.role === 'teacher' && !u.teacherApprovedAt, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt ?? null,
    },
    application: a ? {
      status: a.status, organization: a.organization, note: a.note, degree: a.degree ?? '', degreeLink: a.degreeLink ?? '', proofLinks: a.proofLinks ?? [],
      submittedAt: a.visibleAt ?? a.createdAt, decidedAt: a.decidedAt ?? null, decisionReason: a.decisionReason ?? '',
    } : null,
  };
}

/** Applications the admin can see (the applicant verified their email), with counts for the queue badge. */
export async function listApplications({ limit, cursor, status }) {
  const visible = { visibleAt: { $exists: true } };
  const { items, nextCursor, hasMore } = await page(
    TeacherApplication, { ...visible, status }, { limit, cursor }, 'userId status organization note degree degreeLink proofLinks visibleAt decidedAt decisionReason createdAt',
    async (rows) => {
      const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select('name email').lean();
      const byId = new Map(users.map((u) => [String(u._id), u]));
      return rows.map((r) => ({
        _id: r._id, userId: r.userId, name: byId.get(String(r.userId))?.name ?? '', email: byId.get(String(r.userId))?.email ?? '',
        status: r.status, organization: r.organization, note: r.note,
        degree: r.degree ?? '', degreeLink: r.degreeLink ?? '', proofLinks: r.proofLinks ?? [], submittedAt: r.visibleAt, decidedAt: r.decidedAt ?? null,
        decisionReason: r.decisionReason ?? '', createdAt: r.createdAt,
      }));
    },
  );
  const counted = await TeacherApplication.aggregate([{ $match: visible }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const counts = { pending: 0, approved: 0, rejected: 0, ...Object.fromEntries(counted.map((c) => [c._id, c.n])) };
  return { applications: items, nextCursor, hasMore, counts };
}

export async function listAudit({ limit, cursor, action }) {
  const { items, nextCursor, hasMore } = await page(
    AuditLog, action ? { action } : {}, { limit, cursor }, 'actorEmail action targetEmail before after ip userAgent detail count lastAt createdAt',
  );
  return { entries: items, nextCursor, hasMore };
}
