import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import User from '../../models/User.js';
import TeacherApplication from '../../models/TeacherApplication.js';
import AuditLog from '../../models/AuditLog.js';
import WorkItem from '../../models/WorkItem.js';
import { processWork } from '../../services/workProcessor.js';
import { bootstrapAdmin } from '../../services/adminBootstrap.js';
import { cleanupUnverified } from '../../services/emailMaintenance.js';
import { setMailTransport } from '../../services/mail/mailService.js';
import { createUser } from '../helpers/users.js';

const app = createApp();
const saved = { ...process.env };
const transport = jest.fn();
let n = 0;
let seq = 0;
const ip = () => { n += 1; return `10.8.${(n >> 8) & 255}.${n & 255}`; };
const post = (path, body, address = ip()) => request(app).post(path).set('X-Forwarded-For', address).send(body);
const teacherBody = (extra = {}) => { seq += 1; return { name: 'Tess Teacher', email: `tess${seq}@school.example`, password: 'password123', accountType: 'teacher', organization: 'Open University', note: 'I teach algorithms.', ...extra }; };
const tokenIn = (mail) => mail.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
let sentBefore = 0;
async function deliver() {
  for (const work of await WorkItem.find({ type: 'send-email', status: { $ne: 'completed' } }).sort({ createdAt: 1 })) {
    await processWork({ data: { workItemId: work.id }, attemptsMade: 0, opts: { attempts: 5 } });
  }
  const fresh = transport.mock.calls.slice(sentBefore).map((c) => c[0]);
  sentBefore = transport.mock.calls.length;
  return fresh;
}
/** Sign up as a teacher, verify the email, and return the stored user. */
async function verifiedApplicant(extra) {
  const body = teacherBody(extra);
  expect((await post('/auth/register', body)).status).toBe(202);
  const mails = await deliver();
  const mail = mails.find((m) => m.to === body.email);
  expect((await post('/auth/verify-email', { token: tokenIn(mail) })).status).toBe(200);
  return { body, user: await User.findOne({ email: body.email }) };
}
const login = (email, password = 'password123') => post('/auth/login', { email, password });

beforeEach(async () => {
  process.env = { ...saved, FEATURE_EMAIL_VERIFICATION: 'true', FEATURE_PASSWORD_RESET: 'true', EMAIL_TOKEN_SECRET: 'a-test-secret-that-is-at-least-32-characters', APP_BASE_URL: 'https://app.example.com', MAIL_FROM: 'CodeGrade <no-reply@example.com>', ADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: 'correct-horse-battery-staple-42' };
  transport.mockReset().mockResolvedValue({ id: 'm' });
  sentBefore = 0;
  setMailTransport(transport);
  await bootstrapAdmin();
});
afterEach(() => { process.env = { ...saved }; setMailTransport(undefined); });

describe('teacher signup', () => {
  it('creates an unverified teacher_applicant with an application the admin cannot see yet', async () => {
    const body = teacherBody();
    const res = await post('/auth/register', body);
    expect(res.status).toBe(202);
    expect(res.headers['set-cookie']).toBeUndefined();
    const user = await User.findOne({ email: body.email });
    expect([user.role, user.emailVerified]).toEqual(['teacher_applicant', false]);
    const application = await TeacherApplication.findOne({ userId: user._id });
    expect([application.status, application.organization, application.note, application.visibleAt]).toEqual(['pending', 'Open University', 'I teach algorithms.', undefined]);
    expect(await TeacherApplication.countDocuments({ visibleAt: { $exists: true } })).toBe(0);
    const mails = await deliver();
    expect(mails.map((m) => m.subject)).toEqual(['Verify your email for CodeGrade']); // nothing for the admin yet
    expect(await AuditLog.countDocuments({ action: 'teacher_application.submitted' })).toBe(1);
  });
  it('blocks login until verified, with the usual EMAIL_NOT_VERIFIED', async () => {
    const body = teacherBody();
    await post('/auth/register', body);
    const res = await login(body.email);
    expect([res.status, res.body.code]).toEqual([403, 'EMAIL_NOT_VERIFIED']);
  });
  it('makes the application visible, and tells the admin, only once the email is verified', async () => {
    const { user } = await verifiedApplicant({ name: 'Tess <script>x()</script>', organization: 'Evil <b>Corp</b> https://phish.example', note: 'Hi <img src=x onerror=alert(1)>\nSecond line' });
    const application = await TeacherApplication.findOne({ userId: user._id });
    expect(application.visibleAt).toBeInstanceOf(Date);
    expect(await AuditLog.countDocuments({ action: 'teacher_application.verified' })).toBe(1);
    const [notice] = await deliver();
    expect(notice.to).toBe('boss@example.com');
    expect(notice.subject).toBe('New teacher application');
    expect(notice.html).not.toMatch(/<script>|<img |<b>Corp/);
    expect(notice.html).toContain('&lt;script&gt;');
    expect(notice.html.match(/<a href=/g)).toHaveLength(1); // only our own review link; the applicant's URL is plain text
    expect(notice.html).toContain('https://app.example.com/admin/applications');
    expect(notice.text).toContain('https://phish.example'); // shown as text only
  });
  it('lets the applicant log in but only see /auth/me and their own application', async () => {
    const { body } = await verifiedApplicant();
    const session = await login(body.email);
    expect(session.status).toBe(200);
    expect(session.body.user.role).toBe('teacher_applicant');
    const auth = { Authorization: `Bearer ${session.body.accessToken}` };
    expect((await request(app).get('/auth/me').set(auth)).status).toBe(200);
    const status = await request(app).get('/teacher-application').set(auth);
    expect(status.body.application).toMatchObject({ status: 'pending', organization: 'Open University', note: 'I teach algorithms.' });
    for (const path of ['/problems', '/doubts', '/submissions', '/notifications', '/features', '/leaderboard', '/answers?state=pending']) {
      const res = await request(app).get(path).set(auth);
      expect({ path, status: res.status, code: res.body.code, applicationStatus: res.body.applicationStatus }).toEqual({ path, status: 403, code: 'TEACHER_PENDING', applicationStatus: 'pending' });
    }
  });
  it('gives anyone without an application a 404 from the status route', async () => {
    const student = await createUser({ role: 'student' });
    expect((await request(app).get('/teacher-application').set('Authorization', `Bearer ${student.accessToken}`)).status).toBe(404);
  });
});

describe('what a teacher may submit', () => {
  it.each([
    ['organization missing', { organization: undefined }], ['organization too short', { organization: 'x' }], ['organization too long', { organization: 'o'.repeat(121) }],
    ['note too long', { note: 'n'.repeat(501) }], ['name too long', { name: 'n'.repeat(101) }],
  ])('refuses a teacher signup with %s', async (_label, extra) => {
    const body = { ...teacherBody(), ...extra };
    for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
    const res = await post('/auth/register', body);
    expect(res.status).toBe(400);
    expect(await User.countDocuments({ email: body.email })).toBe(0);
  });
  it('refuses organization and note on a student signup', async () => {
    expect((await post('/auth/register', { name: 'S', email: 's1@x.com', password: 'password123', accountType: 'student', organization: 'Org' })).status).toBe(400);
    expect((await post('/auth/register', { name: 'S', email: 's2@x.com', password: 'password123', accountType: 'student', note: 'hi' })).status).toBe(400);
  });
  it('strips control and bidirectional characters, keeps line breaks in the note, and stores plain text', async () => {
    const { user } = await verifiedApplicant({ organization: 'Uni‮versity\u0000 of ​Test', note: 'line one\r\nline‮ two\n\n\n\nline three', name: 'Ann\u0007 Lee' });
    const application = await TeacherApplication.findOne({ userId: user._id });
    expect(application.organization).toBe('University of Test');
    expect(application.note).toBe('line one\nline two\n\nline three');
    expect(user.name).toBe('Ann Lee');
  });
});

describe('limits', () => {
  it('refuses new teacher signups once the pending cap is reached, and still takes students', async () => {
    process.env.TEACHER_APPLICATION_CAP = '2';
    await verifiedApplicant();
    await verifiedApplicant();
    const refused = await post('/auth/register', teacherBody());
    expect([refused.status, refused.body.code]).toEqual([503, 'TEACHER_APPLICATIONS_FULL']);
    expect((await post('/auth/register', { name: 'S', email: 'student-cap@x.com', password: 'password123', accountType: 'student' })).status).toBe(202);
  });
  it('does not count unverified applications towards the cap', async () => {
    process.env.TEACHER_APPLICATION_CAP = '1';
    for (let i = 0; i < 3; i += 1) expect((await post('/auth/register', teacherBody())).status).toBe(202);
  });
  it('emails the admin about at most TEACHER_NOTIFY_PER_HOUR applications an hour', async () => {
    process.env.TEACHER_NOTIFY_PER_HOUR = '2';
    for (let i = 0; i < 4; i += 1) await verifiedApplicant();
    const toAdmin = transport.mock.calls.map((c) => c[0]).filter((m) => m.subject === 'New teacher application');
    expect(toAdmin).toHaveLength(2);
    expect(await TeacherApplication.countDocuments({ visibleAt: { $exists: true } })).toBe(4);
  });
  it('limits teacher signups per IP and leaves student signups alone', async () => {
    const address = ip();
    const statuses = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await post('/auth/register', teacherBody(), address)).status);
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429, 429]);
    for (let i = 0; i < 3; i += 1) expect((await post('/auth/register', { name: 'S', email: `same-ip-${i}@x.com`, password: 'password123', accountType: 'student' }, address)).status).toBe(202);
  });
});

describe('signup again with the same address', () => {
  it('switches an unverified applicant to a student and removes the application', async () => {
    const body = teacherBody();
    await post('/auth/register', body);
    await post('/auth/register', { name: 'Now student', email: body.email, password: 'password123', accountType: 'student' });
    const user = await User.findOne({ email: body.email });
    expect([user.role, user.name]).toEqual(['student', 'Now student']);
    expect(await TeacherApplication.countDocuments({ userId: user._id })).toBe(0);
  });
  it('switches an unverified student to an applicant with a fresh application', async () => {
    const email = 'switch@school.example';
    await post('/auth/register', { name: 'Sam', email, password: 'password123', accountType: 'student' });
    await post('/auth/register', teacherBody({ email, organization: 'New School' }));
    const user = await User.findOne({ email });
    expect(user.role).toBe('teacher_applicant');
    expect((await TeacherApplication.findOne({ userId: user._id })).organization).toBe('New School');
  });
  it('replaces the old application of an unverified applicant instead of keeping two', async () => {
    const body = teacherBody();
    await post('/auth/register', body);
    await post('/auth/register', { ...body, organization: 'Second Org' });
    const user = await User.findOne({ email: body.email });
    const applications = await TeacherApplication.find({ userId: user._id });
    expect(applications.map((a) => a.organization)).toEqual(['Second Org']);
  });
  it('never turns a verified student into an applicant', async () => {
    const student = await createUser({ role: 'student', emailVerified: true });
    await post('/auth/register', teacherBody({ email: student.email }));
    expect((await User.findById(student.user._id)).role).toBe('student');
    expect(await TeacherApplication.countDocuments()).toBe(0);
  });
});

describe('housekeeping', () => {
  it('deletes the application when a stale unverified signup is cleaned up', async () => {
    const body = teacherBody();
    await post('/auth/register', body);
    const user = await User.findOne({ email: body.email });
    await User.collection.updateOne({ _id: user._id }, { $set: { createdAt: new Date(Date.now() - 9 * 86400000) } });
    await cleanupUnverified();
    expect(await User.countDocuments({ email: body.email })).toBe(0);
    expect(await TeacherApplication.countDocuments()).toBe(0);
  });
  it('removes the application of an account that the bootstrap promotes to admin', async () => {
    process.env.ADMIN_EMAIL = 'promoted@school.example';
    const applicant = await createUser({ role: 'teacher_applicant', email: 'promoted@school.example' });
    await TeacherApplication.create({ userId: applicant.user._id, organization: 'Org', visibleAt: new Date() });
    await bootstrapAdmin();
    expect((await User.findById(applicant.user._id)).role).toBe('admin');
    expect(await TeacherApplication.countDocuments({ userId: applicant.user._id })).toBe(0);
  });
});

describe('with email verification off', () => {
  beforeEach(() => { process.env.FEATURE_EMAIL_VERIFICATION = 'false'; process.env.FEATURE_PASSWORD_RESET = 'false'; });
  it('creates the applicant with a session and a visible application, and sends no email', async () => {
    const res = await post('/auth/register', teacherBody());
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('teacher_applicant');
    const application = await TeacherApplication.findOne({ userId: res.body.user._id });
    expect(application.visibleAt).toBeInstanceOf(Date);
    expect(await WorkItem.countDocuments()).toBe(0);
    const denied = await request(app).get('/problems').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect([denied.status, denied.body.code]).toEqual([403, 'TEACHER_PENDING']);
  });
});
