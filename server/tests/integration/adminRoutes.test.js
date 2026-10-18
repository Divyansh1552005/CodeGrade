import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import User from '../../models/User.js';
import Answer from '../../models/Answer.js';
import Doubt from '../../models/Doubt.js';
import TeacherApplication from '../../models/TeacherApplication.js';
import AuditLog from '../../models/AuditLog.js';
import WorkItem from '../../models/WorkItem.js';
import RefreshToken from '../../models/RefreshToken.js';
import { processWork } from '../../services/workProcessor.js';
import { bootstrapAdmin } from '../../services/adminBootstrap.js';
import { setMailTransport } from '../../services/mail/mailService.js';
import { createUser } from '../helpers/users.js';

const app = createApp();
const saved = { ...process.env };
const transport = jest.fn();
let admin;
const asAdmin = () => ({ Authorization: `Bearer ${admin.accessToken}` });
const get = (path, headers = asAdmin()) => request(app).get(path).set(headers);
const post = (path, body = {}, headers = asAdmin()) => request(app).post(path).set(headers).send(body);
const bearer = (actor) => ({ Authorization: `Bearer ${actor.accessToken}` });
let sentBefore = 0;
async function deliver() {
  for (const work of await WorkItem.find({ type: 'send-email', status: { $ne: 'completed' } }).sort({ createdAt: 1 })) {
    await processWork({ data: { workItemId: work.id }, attemptsMade: 0, opts: { attempts: 5 } });
  }
  const fresh = transport.mock.calls.slice(sentBefore).map((c) => c[0]);
  sentBefore = transport.mock.calls.length;
  return fresh;
}
async function applicant(extra = {}, application = {}) {
  const person = await createUser({ role: 'teacher_applicant', emailVerified: true, ...extra });
  const doc = await TeacherApplication.create({ userId: person.user._id, organization: 'Open University', note: 'Hello', visibleAt: new Date(), ...application });
  return { ...person, application: doc };
}

beforeEach(async () => {
  process.env = { ...saved, EMAIL_TOKEN_SECRET: 'a-test-secret-that-is-at-least-32-characters', APP_BASE_URL: 'https://app.example.com', MAIL_FROM: 'CodeGrade <no-reply@example.com>', ADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: 'correct-horse-battery-staple-42' };
  transport.mockReset().mockResolvedValue({ id: 'm' });
  sentBefore = 0;
  setMailTransport(transport);
  await bootstrapAdmin();
  const row = await User.findOne({ role: 'admin' });
  admin = { user: row, ...(await (await import('../../services/tokenService.js')).issueTokenPair(row)) };
  admin.accessToken = admin.accessToken;
});
afterEach(() => { process.env = { ...saved }; setMailTransport(undefined); });

describe('who can reach /admin', () => {
  it('answers 404 to a student, a teacher, an applicant, a suspended admin, a bad token and no token; 200 to the admin', async () => {
    const student = await createUser({ role: 'student' });
    const teacher = await createUser({ role: 'teacher' });
    const pending = await createUser({ role: 'teacher_applicant' });
    for (const headers of [bearer(student), bearer(teacher), bearer(pending), { Authorization: 'Bearer nonsense' }, {}]) {
      for (const path of ['/admin/users', '/admin/teacher-applications', '/admin/audit-log']) {
        const res = await get(path, headers);
        expect([path, res.status, res.body]).toEqual([path, 404, { error: 'Not found' }]);
      }
      expect((await post(`/admin/users/${student.user._id}/role`, { role: 'teacher' }, headers)).status).toBe(404);
    }
    expect((await User.findById(student.user._id)).role).toBe('student');
    for (const path of ['/admin/users', '/admin/teacher-applications', '/admin/audit-log']) expect((await get(path)).status).toBe(200);
    await User.updateOne({ _id: admin.user._id }, { $set: { suspendedAt: new Date() } });
    expect((await get('/admin/users')).status).toBe(404);
  });
  it('keeps the admin out of every product route', async () => {
    for (const path of ['/problems', '/doubts', '/notifications', '/submissions']) expect((await get(path)).status).toBe(403);
    expect((await get('/auth/me')).status).toBe(200);
  });
  it('has no route that edits or deletes an audit entry', async () => {
    await post(`/admin/users/${(await createUser({ role: 'student' })).user._id}/suspend`);
    for (const method of ['put', 'patch', 'delete']) expect((await request(app)[method]('/admin/audit-log').set(asAdmin()).send({})).status).toBe(404);
  });
});

describe('GET /admin/users/:id', () => {
  it('returns the account with the degree and links they applied with, and nothing secret', async () => {
    const person = await applicant({}, { degree: 'MSc Maths', degreeLink: 'https://example.com/d.pdf', proofLinks: ['https://example.org/cv'] });
    const res = await get(`/admin/users/${person.user._id}`);
    expect(res.status).toBe(200);
    expect(res.body.application).toMatchObject({ status: 'pending', organization: 'Open University', degree: 'MSc Maths', degreeLink: 'https://example.com/d.pdf', proofLinks: ['https://example.org/cv'] });
    expect(res.body.user).toMatchObject({ email: person.user.email, role: 'teacher_applicant' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion/);
  });
  it('has no application for a student, 404 for an unknown id, 400 for a bad id, 404 for a non-admin', async () => {
    const student = await createUser({ role: 'student' });
    expect((await get(`/admin/users/${student.user._id}`)).body.application).toBeNull();
    expect((await get('/admin/users/64b000000000000000000000')).status).toBe(404);
    expect((await get('/admin/users/nope')).status).toBe(400);
    expect((await get(`/admin/users/${student.user._id}`, bearer(student))).status).toBe(404);
  });
});

describe('GET /admin/users', () => {
  it('lists light rows, newest first, with cursor paging and a limit that is clamped', async () => {
    for (let i = 0; i < 5; i += 1) await createUser({ role: 'student', name: `Student ${i}` });
    const first = await get('/admin/users?limit=2');
    expect(first.body.users).toHaveLength(2);
    expect(first.body.hasMore).toBe(true);
    const second = await get(`/admin/users?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.users).toHaveLength(2);
    expect(new Set([...first.body.users, ...second.body.users].map((u) => String(u._id))).size).toBe(4);
    expect(first.body.users[0]).toEqual(expect.objectContaining({ _id: expect.anything(), name: expect.any(String), email: expect.any(String), role: expect.any(String), emailVerified: expect.any(Boolean), status: 'active', createdAt: expect.anything() }));
    const keys = Object.keys(first.body.users[0]);
    expect(keys.filter((k) => /password|token|totp|secret|hash/i.test(k))).toEqual([]);
    expect((await get('/admin/users?limit=500')).body.users.length).toBeLessThanOrEqual(50);
    expect((await get('/admin/users?limit=0')).status).toBe(400);
    expect((await get('/admin/users?cursor=garbage')).status).toBe(400);
  });
  it('filters by role and status and searches the start of the name or email', async () => {
    const [a, b] = [await createUser({ role: 'teacher', name: 'Alice Teacher', email: 'alice@x.com' }), await createUser({ role: 'student', name: 'Bob', email: 'bob@x.com' })];
    await User.updateOne({ _id: b.user._id }, { $set: { suspendedAt: new Date() } });
    expect((await get('/admin/users?role=teacher')).body.users.map((u) => u.email)).toEqual(['alice@x.com']);
    expect((await get('/admin/users?status=suspended')).body.users.map((u) => u.email)).toEqual(['bob@x.com']);
    expect((await get('/admin/users?status=active&role=student')).body.users).toEqual([]);
    expect((await get('/admin/users?q=ali')).body.users.map((u) => u.email)).toEqual(['alice@x.com']);
    expect((await get('/admin/users?q=BOB')).body.users.map((u) => u.email)).toEqual(['bob@x.com']);
    expect((await get('/admin/users?q=.*')).body.users).toEqual([]); // a regex in the search is just text
    expect((await get('/admin/users?role=wizard')).status).toBe(400);
    expect(a).toBeDefined();
  });
  it('marks legacy teachers (never approved), shows applicant status and the admin row', async () => {
    await createUser({ role: 'teacher', email: 'legacy@x.com' });
    await createUser({ role: 'teacher', email: 'approved@x.com', teacherApprovedAt: new Date() });
    const rejected = await applicant({ email: 'rej@x.com' }, { status: 'rejected' });
    const rows = Object.fromEntries((await get('/admin/users?limit=50')).body.users.map((u) => [u.email, u]));
    expect(rows['legacy@x.com'].legacy).toBe(true);
    expect(rows['approved@x.com'].legacy).toBe(false);
    expect(rows['rej@x.com'].applicationStatus).toBe('rejected');
    expect(rows['boss@example.com']).toMatchObject({ role: 'admin', isAdmin: true, legacy: false });
    expect(rejected).toBeDefined();
  });
});

describe('changing a role', () => {
  it('promotes a student to teacher: the old session ends, the new role works after logging in again', async () => {
    const student = await createUser({ role: 'student' });
    const res = await post(`/admin/users/${student.user._id}/role`, { role: 'teacher' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('teacher');
    expect((await User.findById(student.user._id)).teacherApprovedAt).toBeInstanceOf(Date);
    expect((await get('/auth/me', bearer(student))).status).toBe(401);
    const login = await request(app).post('/auth/login').send({ email: student.email, password: student.password });
    expect((await get('/answers?state=pending', { Authorization: `Bearer ${login.body.accessToken}` })).status).toBe(200);
  });
  it('demotes a teacher at once, with the same token, and leaves their approved answers alone', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const doubt = await Doubt.create({ studentId: teacher.user._id, title: 'Q', body: 'B' });
    const answer = await Answer.create({ doubtId: doubt._id, content: 'A', source: 'teacher', state: 'pending' });
    await Answer.updateOne({ _id: answer._id }, { $set: { state: 'approved', reviewedBy: teacher.user._id, reviewedAt: new Date() } });
    expect((await get('/answers?state=pending', bearer(teacher))).status).toBe(200);
    expect((await post(`/admin/users/${teacher.user._id}/role`, { role: 'student' })).status).toBe(200);
    expect((await get('/answers?state=pending', bearer(teacher))).status).toBe(401);
    const kept = await Answer.findById(answer._id);
    expect([kept.state, String(kept.reviewedBy)]).toEqual(['approved', String(teacher.user._id)]);
    expect(await RefreshToken.countDocuments({ userId: teacher.user._id, revokedAt: { $exists: false } })).toBe(0);
    expect((await User.findById(teacher.user._id)).teacherApprovedAt).toBeUndefined();
  });
  it('audits who changed what, with the role before and after', async () => {
    const student = await createUser({ role: 'student' });
    await post(`/admin/users/${student.user._id}/role`, { role: 'teacher' });
    const row = await AuditLog.findOne({ action: 'role.changed' }).lean();
    expect(row).toMatchObject({ actorEmail: 'boss@example.com', targetEmail: student.email, before: { role: 'student' }, after: { role: 'teacher' } });
  });
  it('never grants admin, and never touches the admin, yourself, an applicant or a missing user', async () => {
    const student = await createUser({ role: 'student' });
    for (const role of ['admin', 'teacher_applicant', 'wizard']) expect((await post(`/admin/users/${student.user._id}/role`, { role })).status).toBe(400);
    expect((await post(`/admin/users/${student.user._id}/role`, { role: 'teacher', extra: true })).status).toBe(400);
    expect((await User.findById(student.user._id)).role).toBe('student');
    const onAdmin = await post(`/admin/users/${admin.user._id}/role`, { role: 'student' });
    expect([onAdmin.status, onAdmin.body.code]).toEqual([409, 'ADMIN_PROTECTED']);
    expect((await User.findById(admin.user._id)).role).toBe('admin');
    const pending = await applicant();
    expect((await post(`/admin/users/${pending.user._id}/role`, { role: 'teacher' })).body.code).toBe('USE_APPLICATION');
    expect((await post(`/admin/users/${student.user._id}/role`, { role: 'student' })).body.code).toBe('NO_CHANGE');
    expect((await post('/admin/users/507f1f77bcf86cd799439011/role', { role: 'teacher' })).status).toBe(404);
    expect((await post('/admin/users/not-an-id/role', { role: 'teacher' })).status).toBe(400);
  });
  it('lets only one of two parallel requests change the role', async () => {
    const student = await createUser({ role: 'student' });
    const results = await Promise.all([1, 2, 3].map(() => post(`/admin/users/${student.user._id}/role`, { role: 'teacher' })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: 'role.changed' })).toBe(1);
  });
});

describe('suspending', () => {
  it('blocks login with the generic message, ends sessions and refresh tokens, and can be undone', async () => {
    const student = await createUser({ role: 'student' });
    const session = await request(app).post('/auth/login').send({ email: student.email, password: student.password });
    const cookie = session.headers['set-cookie'].find((c) => c.startsWith('refreshToken=')).split(';')[0];
    expect((await post(`/admin/users/${student.user._id}/suspend`)).status).toBe(200);
    expect((await get('/problems', { Authorization: `Bearer ${session.body.accessToken}` })).status).toBe(401);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    const wrong = await request(app).post('/auth/login').send({ email: student.email, password: 'wrong-password' });
    const suspended = await request(app).post('/auth/login').send({ email: student.email, password: student.password });
    expect([suspended.status, suspended.body]).toEqual([wrong.status, wrong.body]);
    expect((await post(`/admin/users/${student.user._id}/suspend`)).body.code).toBe('NO_CHANGE');
    expect((await post(`/admin/users/${student.user._id}/unsuspend`)).status).toBe(200);
    expect((await request(app).post('/auth/login').send({ email: student.email, password: student.password })).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: { $in: ['user.suspended', 'user.unsuspended'] } })).toBe(2);
  });
  it('refuses to suspend the admin or yourself', async () => {
    expect((await post(`/admin/users/${admin.user._id}/suspend`)).body.code).toBe('ADMIN_PROTECTED');
    expect((await User.findById(admin.user._id)).suspendedAt).toBeUndefined();
  });
});

describe('applications queue', () => {
  it('lists only applicants who verified their email, with counts, filters and paging', async () => {
    const unverified = await createUser({ role: 'teacher_applicant', emailVerified: false });
    await TeacherApplication.create({ userId: unverified.user._id, organization: 'Unverified Org' });
    await applicant({ name: 'Ann' }, { organization: 'Org A' });
    await applicant({ name: 'Ben' }, { organization: 'Org B', status: 'approved' });
    await applicant({ name: 'Cy' }, { organization: 'Org C', status: 'rejected', decisionReason: 'Not a school' });
    const pending = await get('/admin/teacher-applications');
    expect(pending.body.applications.map((a) => a.organization)).toEqual(['Org A']);
    expect(pending.body.counts).toEqual({ pending: 1, approved: 1, rejected: 1 });
    expect(pending.body.applications[0]).toMatchObject({ name: 'Ann', status: 'pending', note: 'Hello' });
    expect((await get('/admin/teacher-applications?status=rejected')).body.applications[0]).toMatchObject({ organization: 'Org C', decisionReason: 'Not a school' });
    expect((await get('/admin/teacher-applications?status=bogus')).status).toBe(400);
    for (let i = 0; i < 3; i += 1) await applicant({}, { organization: `Extra ${i}` });
    const page1 = await get('/admin/teacher-applications?limit=2');
    const page2 = await get(`/admin/teacher-applications?limit=2&cursor=${page1.body.nextCursor}`);
    expect(page1.body.applications.length + page2.body.applications.length).toBe(4);
    expect(JSON.stringify(pending.body)).not.toContain('Unverified Org');
  });
  it('treats an application that is not visible as missing', async () => {
    const unverified = await createUser({ role: 'teacher_applicant', emailVerified: false });
    const app1 = await TeacherApplication.create({ userId: unverified.user._id, organization: 'Org' });
    expect((await post(`/admin/teacher-applications/${app1._id}/approve`)).status).toBe(404);
    expect((await User.findById(unverified.user._id)).role).toBe('teacher_applicant');
  });
});

describe('approving', () => {
  it('makes the applicant a teacher, ends their sessions, audits, and queues one approval email', async () => {
    const person = await applicant({ name: 'Tess' });
    const res = await post(`/admin/teacher-applications/${person.application._id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('approved');
    const user = await User.findById(person.user._id);
    expect([user.role, user.teacherApprovedAt instanceof Date]).toEqual(['teacher', true]);
    expect((await get('/auth/me', bearer(person))).status).toBe(401);
    expect((await request(app).post('/auth/login').send({ email: person.email, password: person.password })).status).toBe(200);
    const row = await AuditLog.findOne({ action: 'teacher_application.approved' }).lean();
    expect(row).toMatchObject({ actorEmail: 'boss@example.com', targetEmail: person.email, before: { role: 'teacher_applicant' }, after: { role: 'teacher' } });
    const mails = await deliver();
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: person.email, subject: 'Your teacher account was approved' });
    expect(mails[0].text).toContain('https://app.example.com/login');
    expect(await deliver()).toHaveLength(0);
  });
  it('lets the new teacher use the teacher routes after logging in again', async () => {
    const person = await applicant();
    await post(`/admin/teacher-applications/${person.application._id}/approve`);
    const login = await request(app).post('/auth/login').send({ email: person.email, password: person.password });
    expect(login.body.user.role).toBe('teacher');
    expect((await get('/answers?state=pending', { Authorization: `Bearer ${login.body.accessToken}` })).status).toBe(200);
  });
  it('decides only once when many requests arrive together: one result, one email, one audit row', async () => {
    const person = await applicant();
    const results = await Promise.all(Array.from({ length: 6 }, () => post(`/admin/teacher-applications/${person.application._id}/approve`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409 && r.body.code === 'ALREADY_DECIDED')).toHaveLength(5);
    expect(await AuditLog.countDocuments({ action: 'teacher_application.approved' })).toBe(1);
    expect(await deliver()).toHaveLength(1);
    expect((await TeacherApplication.findById(person.application._id)).decisionSeq).toBe(1);
  });
  it('lets only one of an approve and a reject sent together win', async () => {
    const person = await applicant();
    const results = await Promise.all([post(`/admin/teacher-applications/${person.application._id}/approve`), post(`/admin/teacher-applications/${person.application._id}/reject`, { reason: 'No' })]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const final = await TeacherApplication.findById(person.application._id);
    expect((await User.findById(person.user._id)).role).toBe(final.status === 'approved' ? 'teacher' : 'teacher_applicant');
  });
});

describe('rejecting', () => {
  it('keeps the user an applicant with no access, shows them the reason, and queues one email with the reason escaped', async () => {
    const person = await applicant({ name: 'Rae' });
    const res = await post(`/admin/teacher-applications/${person.application._id}/reject`, { reason: 'Not a <b>school</b>‮ x' });
    expect(res.status).toBe(200);
    expect(res.body.application).toMatchObject({ status: 'rejected', decisionReason: 'Not a <b>school</b> x' });
    expect((await User.findById(person.user._id)).role).toBe('teacher_applicant');
    const login = await request(app).post('/auth/login').send({ email: person.email, password: person.password });
    expect(login.status).toBe(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };
    const denied = await get('/problems', auth);
    expect(denied.body).toMatchObject({ code: 'TEACHER_PENDING', applicationStatus: 'rejected', reason: 'Not a <b>school</b> x' });
    expect((await get('/answers?state=pending', auth)).status).toBe(403);
    expect((await get('/teacher-application', auth)).body.application).toMatchObject({ status: 'rejected', decisionReason: 'Not a <b>school</b> x' });
    const mails = await deliver();
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe('Your teacher application was not approved');
    expect(mails[0].html).not.toContain('<b>school</b>');
    expect(mails[0].html).toContain('&lt;b&gt;school&lt;/b&gt;');
    expect(await deliver()).toHaveLength(0);
  });
  it('works without a reason, and the reason is limited to 240 characters', async () => {
    const person = await applicant();
    expect((await post(`/admin/teacher-applications/${person.application._id}/reject`, { reason: 'x'.repeat(241) })).status).toBe(400);
    expect((await post(`/admin/teacher-applications/${person.application._id}/reject`)).status).toBe(200);
    expect((await TeacherApplication.findById(person.application._id)).decisionReason).toBeUndefined();
  });
  it('decides once under parallel requests', async () => {
    const person = await applicant();
    const results = await Promise.all(Array.from({ length: 5 }, () => post(`/admin/teacher-applications/${person.application._id}/reject`, { reason: 'No' })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: 'teacher_application.rejected' })).toBe(1);
    expect(await deliver()).toHaveLength(1);
  });
  it('refuses to reject an application that is already decided', async () => {
    const person = await applicant();
    await post(`/admin/teacher-applications/${person.application._id}/approve`);
    expect((await post(`/admin/teacher-applications/${person.application._id}/reject`)).body.code).toBe('ALREADY_DECIDED');
    expect((await User.findById(person.user._id)).role).toBe('teacher');
  });
  it('lets the admin flip a rejected application to approved, with a new email for the new decision', async () => {
    const person = await applicant();
    await post(`/admin/teacher-applications/${person.application._id}/reject`, { reason: 'Unclear' });
    expect((await deliver()).map((m) => m.subject)).toEqual(['Your teacher application was not approved']);
    const flip = await post(`/admin/teacher-applications/${person.application._id}/approve`);
    expect(flip.status).toBe(200);
    const stored = await TeacherApplication.findById(person.application._id);
    expect([stored.status, stored.decisionSeq, stored.decisionReason]).toEqual(['approved', 2, undefined]);
    expect((await User.findById(person.user._id)).role).toBe('teacher');
    expect((await deliver()).map((m) => m.subject)).toEqual(['Your teacher account was approved']);
  });
  it('skips a stale rejection email when the decision was reversed before it was sent', async () => {
    const person = await applicant();
    await post(`/admin/teacher-applications/${person.application._id}/reject`);
    await post(`/admin/teacher-applications/${person.application._id}/approve`);
    expect((await deliver()).map((m) => m.subject)).toEqual(['Your teacher account was approved']);
  });
});

describe('audit log', () => {
  it('lists entries newest first with paging and an action filter, and keeps no secrets', async () => {
    const student = await createUser({ role: 'student' });
    await post(`/admin/users/${student.user._id}/suspend`);
    await post(`/admin/users/${student.user._id}/unsuspend`);
    await post(`/admin/users/${student.user._id}/role`, { role: 'teacher' });
    const all = await get('/admin/audit-log?limit=2');
    expect(all.body.entries).toHaveLength(2);
    expect(all.body.entries[0].action).toBe('role.changed');
    const next = await get(`/admin/audit-log?limit=2&cursor=${all.body.nextCursor}`);
    expect(next.body.entries.map((e) => e.action)).toContain('user.suspended');
    expect((await get('/admin/audit-log?action=user.unsuspended')).body.entries.map((e) => e.action)).toEqual(['user.unsuspended']);
    expect((await get('/admin/audit-log?action=made.up')).status).toBe(400);
    expect(JSON.stringify(all.body)).not.toMatch(/passwordHash|accessToken|tokenVersion/);
  });
  it('records bootstrap, login, suspension, role change and both decisions', async () => {
    const [a, b] = [await applicant(), await applicant()];
    await post(`/admin/teacher-applications/${a.application._id}/approve`);
    await post(`/admin/teacher-applications/${b.application._id}/reject`);
    const student = await createUser({ role: 'student' });
    await post(`/admin/users/${student.user._id}/suspend`);
    await post(`/admin/users/${student.user._id}/unsuspend`);
    await post(`/admin/users/${student.user._id}/role`, { role: 'teacher' });
    const actions = new Set((await AuditLog.find().lean()).map((r) => r.action));
    for (const action of ['admin.bootstrapped', 'teacher_application.approved', 'teacher_application.rejected', 'user.suspended', 'user.unsuspended', 'role.changed']) expect(actions.has(action)).toBe(true);
  });
});
