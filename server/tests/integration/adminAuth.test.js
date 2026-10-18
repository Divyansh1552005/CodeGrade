import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import User from '../../models/User.js';
import AuditLog from '../../models/AuditLog.js';
import RefreshToken from '../../models/RefreshToken.js';
import WorkItem from '../../models/WorkItem.js';
import { bootstrapAdmin } from '../../services/adminBootstrap.js';
import { validateAdminConfig } from '../../services/adminConfig.js';
import { createUser } from '../helpers/users.js';
import { setMailTransport } from '../../services/mail/mailService.js';
import { resetAdminLoginLimits } from '../../middleware/adminLoginLimit.js';

const app = createApp();
const saved = { ...process.env };
const PASSWORD = 'correct-horse-battery-staple-42';
let n = 0;
const ip = () => { n += 1; return `10.9.${(n >> 8) & 255}.${n & 255}`; };
const post = (path, body, { address = ip(), cookie } = {}) => {
  const req = request(app).post(path).set('X-Forwarded-For', address);
  if (cookie) req.set('Cookie', cookie);
  return req.send(body);
};
const adminEnv = (extra = {}) => { process.env = { ...saved, ADMIN_EMAIL: 'Boss@Example.com', ADMIN_PASSWORD: PASSWORD, ...extra }; };
const loginAdmin = (extra = {}, opts) => post('/auth/login', { email: 'boss@example.com', password: PASSWORD, scope: 'admin', ...extra }, opts);
const cookieOf = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('refreshToken='));

beforeEach(async () => { adminEnv(); await resetAdminLoginLimits(); });
afterEach(() => { process.env = { ...saved }; jest.restoreAllMocks(); setMailTransport(undefined); });

describe('admin bootstrap', () => {
  it('creates the one admin: verified, role admin, hashed password, audited', async () => {
    expect(await bootstrapAdmin()).toMatchObject({ created: true });
    const admin = await User.findOne({ email: 'boss@example.com' });
    expect([admin.role, admin.emailVerified, admin.envAdmin]).toEqual(['admin', true, true]);
    expect(admin.passwordHash).not.toContain(PASSWORD);
    expect(await admin.comparePassword(PASSWORD)).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'admin.bootstrapped' })).toBe(1);
    expect(await User.countDocuments({ role: 'admin' })).toBe(1);
  });
  it('does nothing on a restart: same hash, same sessions, no new audit rows', async () => {
    await bootstrapAdmin();
    const before = await User.findOne({ role: 'admin' });
    expect(await bootstrapAdmin()).toMatchObject({ created: false, promoted: false, passwordChanged: false, demoted: 0 });
    const after = await User.findOne({ role: 'admin' });
    expect([after.passwordHash, after.tokenVersion]).toEqual([before.passwordHash, before.tokenVersion]);
    expect(await AuditLog.countDocuments()).toBe(1);
  });
  it('updates the hash and ends the sessions when ADMIN_PASSWORD changes', async () => {
    await bootstrapAdmin();
    const first = await loginAdmin();
    expect(first.status).toBe(200);
    adminEnv({ ADMIN_PASSWORD: 'another-long-random-password-99' });
    expect(await bootstrapAdmin()).toMatchObject({ passwordChanged: true });
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${first.body.accessToken}`)).status).toBe(401);
    expect((await post('/auth/refresh', {}, { cookie: cookieOf(first).split(';')[0] })).status).toBe(401);
    expect((await loginAdmin({ password: PASSWORD })).status).toBe(401);
    expect((await loginAdmin({ password: 'another-long-random-password-99' })).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'admin.password_changed' })).toBe(1);
  });
  it('promotes an existing account, always taking the env password, ending its sessions', async () => {
    const student = await createUser({ role: 'student', email: 'boss@example.com', password: 'my-own-old-password', emailVerified: false });
    await bootstrapAdmin();
    const admin = await User.findOne({ email: 'boss@example.com' });
    expect([admin.role, admin.emailVerified]).toEqual(['admin', true]);
    expect(await admin.comparePassword(PASSWORD)).toBe(true);
    expect(await admin.comparePassword('my-own-old-password')).toBe(false);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${student.accessToken}`)).status).toBe(401);
    const row = await AuditLog.findOne({ action: 'admin.bootstrapped' });
    expect([row.detail, row.before.role, row.after.role]).toEqual(['promoted', 'student', 'admin']);
  });
  it('promotes the new admin first and then demotes the old one when ADMIN_EMAIL changes', async () => {
    await bootstrapAdmin();
    const oldAdmin = await User.findOne({ email: 'boss@example.com' });
    const session = await loginAdmin();
    adminEnv({ ADMIN_EMAIL: 'second@example.com' });
    expect(await bootstrapAdmin()).toMatchObject({ created: true, demoted: 1 });
    expect((await User.findById(oldAdmin._id)).role).toBe('student');
    expect((await User.findById(oldAdmin._id)).envAdmin).toBeUndefined();
    expect((await User.find({ role: 'admin' })).map((u) => u.email)).toEqual(['second@example.com']);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${session.body.accessToken}`)).status).toBe(401);
    const rows = await AuditLog.find({ action: { $in: ['admin.bootstrapped', 'admin.demoted'] } }).sort({ _id: 1 });
    expect(rows.map((r) => [r.action, r.targetEmail])).toEqual([['admin.bootstrapped', 'boss@example.com'], ['admin.bootstrapped', 'second@example.com'], ['admin.demoted', 'boss@example.com']]);
  });
  it('re-promotes the previous admin when ADMIN_EMAIL is switched back, ending with one admin', async () => {
    await bootstrapAdmin();
    adminEnv({ ADMIN_EMAIL: 'second@example.com' });
    await bootstrapAdmin();
    adminEnv();
    await bootstrapAdmin();
    expect((await User.find({ role: 'admin' })).map((u) => u.email)).toEqual(['boss@example.com']);
  });
  it('demotes any other admin account so there is only one', async () => {
    await createUser({ role: 'admin', email: 'stray@example.com' });
    await bootstrapAdmin();
    expect((await User.find({ role: 'admin' })).map((u) => u.email)).toEqual(['boss@example.com']);
  });
  it('leaves an existing admin alone and only warns when ADMIN_EMAIL is not set', async () => {
    await bootstrapAdmin();
    process.env = { ...saved }; delete process.env.ADMIN_EMAIL; delete process.env.ADMIN_PASSWORD;
    expect(await bootstrapAdmin()).toEqual({ skipped: 'no_admin_email' });
    expect((await User.findOne({ email: 'boss@example.com' })).role).toBe('admin');
  });
  it('lets two instances starting together end with one admin', async () => {
    await Promise.all([bootstrapAdmin(), bootstrapAdmin(), bootstrapAdmin()]);
    expect(await User.countDocuments({ role: 'admin' })).toBe(1);
  });
});

describe('admin configuration', () => {
  const prod = (extra) => ({ NODE_ENV: 'production', ADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: PASSWORD, ...extra });
  it('accepts a long random password in production', () => {
    expect(() => validateAdminConfig(prod({}))).not.toThrow();
  });
  it.each([
    ['too short', 'Sh0rt-Pass1'], ['a common word', 'my-password-is-very-long-123'], ['admin in it', 'Administrator-2026-xyz'],
    ['the email name', 'boss-is-the-best-boss-1'], ['a sequence', '1234567890-abcdef'], ['repeating', 'aaaaaaaaaaaaaaaa'], ['changeme', 'changeme-changeme-1'],
  ])('refuses a weak password in production (%s)', (_name, password) => {
    expect(() => validateAdminConfig(prod({ ADMIN_PASSWORD: password }))).toThrow();
  });
  it('refuses a missing password and a bad email', () => {
    expect(() => validateAdminConfig(prod({ ADMIN_PASSWORD: '' }))).toThrow(/ADMIN_PASSWORD is required/);
    expect(() => validateAdminConfig(prod({ ADMIN_EMAIL: 'nope' }))).toThrow(/ADMIN_EMAIL/);
  });
  it('allows a short password outside production but never one over 72 bytes', () => {
    expect(() => validateAdminConfig({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'devpass1' })).not.toThrow();
    expect(() => validateAdminConfig({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'x'.repeat(73) })).toThrow(/72 bytes/);
  });
  it('starts without an admin, with a warning, when ADMIN_EMAIL is not set', () => {
    expect(validateAdminConfig({}).warnings[0]).toMatch(/ADMIN_EMAIL is not set/);
    expect(validateAdminConfig(prod({})).warnings).toEqual([]);
  });
  it('never puts the password in an error, a warning or any output', async () => {
    const secret = 'Sh0rt-Pass1';
    const out = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => { out.push(String(chunk)); return true; });
    jest.spyOn(console, 'log').mockImplementation((...a) => out.push(a.join(' ')));
    jest.spyOn(console, 'error').mockImplementation((...a) => out.push(a.join(' ')));
    process.env.LOG_LEVEL = 'debug';
    let message = '';
    try { validateAdminConfig(prod({ ADMIN_PASSWORD: secret })); } catch (err) { message = err.message; }
    adminEnv({ ADMIN_PASSWORD: PASSWORD });
    await bootstrapAdmin();
    adminEnv({ ADMIN_PASSWORD: 'another-long-random-password-99' });
    await bootstrapAdmin();
    expect(message).not.toContain(secret);
    expect(`${out.join('\n')}${JSON.stringify(await AuditLog.find().lean())}`).not.toMatch(new RegExp(`${PASSWORD}|another-long-random-password-99`));
  });
});

describe('reserved admin address', () => {
  beforeEach(async () => { await bootstrapAdmin(); });
  const unchanged = async () => {
    const admin = await User.findOne({ role: 'admin' });
    return JSON.stringify(admin.toObject());
  };
  it('refuses signup like any existing account, with the email flags off, and changes nothing', async () => {
    process.env.FEATURE_EMAIL_VERIFICATION = 'false';
    const before = await unchanged();
    const reserved = await post('/auth/register', { name: 'Eve', email: 'BOSS@example.com', password: 'password123', accountType: 'student' });
    const normal = await createUser({ email: 'someone@example.com' });
    const existing = await post('/auth/register', { name: 'Eve', email: normal.email, password: 'password123', accountType: 'student' });
    expect([reserved.status, reserved.body]).toEqual([existing.status, existing.body]);
    expect(await unchanged()).toBe(before);
  });
  it('answers the generic response and does nothing on signup, resend and forgot-password with the flags on', async () => {
    Object.assign(process.env, { FEATURE_EMAIL_VERIFICATION: 'true', FEATURE_PASSWORD_RESET: 'true', EMAIL_TOKEN_SECRET: 'a-test-secret-that-is-at-least-32-characters', APP_BASE_URL: 'https://app.example.com', MAIL_FROM: 'a@b.co' });
    const before = await unchanged();
    const verified = await createUser({ email: 'real@example.com' });
    const [s1, s2] = [await post('/auth/register', { name: 'Eve', email: 'boss@example.com', password: 'password123', accountType: 'student' }), await post('/auth/register', { name: 'Eve', email: verified.email, password: 'password123', accountType: 'student' })];
    expect([s1.status, Object.keys(s1.body)]).toEqual([s2.status, Object.keys(s2.body)]);
    const f1 = await post('/auth/forgot-password', { email: 'boss@example.com' });
    const f2 = await post('/auth/forgot-password', { email: 'ghost@example.com' });
    expect([f1.status, f1.body]).toEqual([f2.status, f2.body]);
    const r1 = await post('/auth/resend-verification', { email: 'boss@example.com' });
    const r2 = await post('/auth/resend-verification', { email: 'ghost@example.com' });
    expect([r1.status, r1.body]).toEqual([r2.status, r2.body]);
    expect(await unchanged()).toBe(before);
    expect(await WorkItem.find({ 'payload.userId': String((await User.findOne({ role: 'admin' }))._id) })).toHaveLength(0);
    expect(await User.countDocuments({ email: 'boss@example.com' })).toBe(1);
  });
});

describe('the admin does not depend on the mail setup', () => {
  it('bootstraps and logs in with no mail configuration at all', async () => {
    for (const name of ['BREVO_API_KEY', 'MAIL_FROM', 'EMAIL_TOKEN_SECRET', 'APP_BASE_URL', 'FEATURE_EMAIL_VERIFICATION', 'FEATURE_PASSWORD_RESET']) delete process.env[name];
    await bootstrapAdmin();
    expect((await loginAdmin()).status).toBe(200);
  });
  it('logs in while the mail provider is down, because logging in sends nothing', async () => {
    Object.assign(process.env, { FEATURE_EMAIL_VERIFICATION: 'true', FEATURE_PASSWORD_RESET: 'true', EMAIL_TOKEN_SECRET: 'a-test-secret-that-is-at-least-32-characters', APP_BASE_URL: 'https://app.example.com', MAIL_FROM: 'a@b.co' });
    const down = jest.fn().mockRejectedValue(new Error('provider down'));
    setMailTransport(down);
    await bootstrapAdmin();
    expect((await loginAdmin()).status).toBe(200);
    expect(down).not.toHaveBeenCalled();
    expect(await WorkItem.countDocuments({ type: 'send-email' })).toBe(0);
  });
});

describe('admin login', () => {
  beforeEach(async () => { await bootstrapAdmin(); });
  it('logs the admin in with scope admin or without it, through the normal login API', async () => {
    const scoped = await loginAdmin();
    expect(scoped.status).toBe(200);
    expect(scoped.body.user.role).toBe('admin');
    const plain = await post('/auth/login', { email: 'boss@example.com', password: PASSWORD });
    expect(plain.status).toBe(200);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${scoped.body.accessToken}`)).body.user.role).toBe('admin');
  });
  it('refuses a non-admin with scope admin exactly like a wrong password: same body, no cookie, no token, no login time', async () => {
    const student = await createUser({ role: 'student' });
    const wrong = await loginAdmin({ email: 'boss@example.com', password: 'wrong-password' });
    const asStudent = await post('/auth/login', { email: student.email, password: student.password, scope: 'admin' });
    const unknown = await post('/auth/login', { email: 'ghost@example.com', password: 'password123', scope: 'admin' });
    for (const res of [asStudent, unknown]) {
      expect([res.status, res.body]).toEqual([wrong.status, wrong.body]);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(await RefreshToken.countDocuments({ userId: student.user._id })).toBe(1); // only the one createUser made
    expect((await User.findById(student.user._id)).lastLoginAt).toBeUndefined();
    const reasons = (await AuditLog.find({ action: 'admin.login_failed' }).lean()).map((r) => r.detail);
    expect(reasons.length).toBeGreaterThan(0);
  });
  it('audits failures and successes without the attempted password, coalescing repeats', async () => {
    const address = ip();
    for (let i = 0; i < 4; i += 1) await loginAdmin({ password: `guess-number-${i}` }, { address });
    await loginAdmin({}, { address: ip() });
    const rows = await AuditLog.find().lean();
    const failed = rows.filter((r) => r.action === 'admin.login_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].count).toBe(4);
    expect(rows.some((r) => r.action === 'admin.login')).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/guess-number|correct-horse/);
  });
  it('limits attempts per IP, answering 429 with Retry-After', async () => {
    const address = ip();
    const statuses = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await loginAdmin({ password: 'nope-nope' }, { address })).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429]);
    const blocked = await loginAdmin({}, { address });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.body.error).toBe('Too many attempts. Try again in a few minutes.');
    // refused attempts are audited too, sharing the row of this IP and minute
    expect((await AuditLog.findOne({ action: 'admin.login_failed', ip: address }).lean()).count).toBe(8);
  });
  it('locks the admin account after 5 failed attempts: the same generic 401 even with the right password, no 429, no cookie', async () => {
    for (let i = 0; i < 5; i += 1) expect((await loginAdmin({ password: 'nope-nope' })).status).toBe(401); // five different IPs
    const wrong = await loginAdmin({ password: 'nope-nope' });
    const right = await loginAdmin();
    for (const res of [wrong, right]) {
      expect([res.status, res.body]).toEqual([401, { error: 'Invalid credentials' }]);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.headers['retry-after']).toBeUndefined();
    }
    const plain = await post('/auth/login', { email: 'boss@example.com', password: PASSWORD });
    expect(plain.status).toBe(401); // also without scope
    expect(await AuditLog.countDocuments({ action: 'admin.login_failed', detail: 'locked out' })).toBeGreaterThan(0);
  });
  it('does not extend the lockout with more attempts, so it ends by itself within 15 minutes', async () => {
    const { adminLockedOut } = await import('../../middleware/adminLoginLimit.js');
    for (let i = 0; i < 5; i += 1) await loginAdmin({ password: 'nope-nope' });
    expect(await adminLockedOut()).toBe(true);
    for (let i = 0; i < 5; i += 1) await loginAdmin({ password: 'nope-nope' });
    const status = (await import('../../middleware/adminLoginLimit.js')).adminFailureStatus;
    const { used, ttlMs } = await status();
    expect(used).toBe(5);
    expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(ttlMs).toBeGreaterThan(0);
    await resetAdminLoginLimits(); // what the 15 minutes do on their own
    expect((await loginAdmin()).status).toBe(200);
  });
  it('counts only failures against the admin address, so a student cannot lock the admin out', async () => {
    const student = await createUser({ role: 'student' });
    for (let i = 0; i < 7; i += 1) await post('/auth/login', { email: student.email, password: 'wrong-password', scope: 'admin' });
    expect((await loginAdmin()).status).toBe(200);
  });
  it('forgets earlier failures after a successful login', async () => {
    for (let i = 0; i < 4; i += 1) await loginAdmin({ password: 'nope-nope' });
    expect((await loginAdmin()).status).toBe(200);
    for (let i = 0; i < 4; i += 1) await loginAdmin({ password: 'nope-nope' });
    expect((await loginAdmin()).status).toBe(200);
  });
  it('does not apply the admin limit to ordinary logins', async () => {
    const student = await createUser({ role: 'student' });
    const address = ip();
    for (let i = 0; i < 14; i += 1) expect((await post('/auth/login', { email: student.email, password: student.password }, { address })).status).toBe(200);
  });
  it('gives the admin a short session: the refresh cookie lasts ADMIN_SESSION_HOURS and the access token never outlives it', async () => {
    adminEnv({ ADMIN_SESSION_HOURS: '2' });
    const res = await loginAdmin();
    const refresh = jwt.decode(cookieOf(res).split(';')[0].replace('refreshToken=', ''));
    expect(refresh.exp - refresh.iat).toBe(2 * 3600);
    expect(refresh.se).toBe(refresh.exp);
    const access = jwt.decode(res.body.accessToken);
    expect(access.exp - access.iat).toBeLessThanOrEqual(15 * 60);
    expect(cookieOf(res)).toMatch(/Max-Age=7\d{3}/);
  });
  it('never extends the session by refreshing it, and ends it at the fixed time', async () => {
    adminEnv({ ADMIN_SESSION_HOURS: '1' });
    const login = await loginAdmin();
    const original = jwt.decode(cookieOf(login).split(';')[0].replace('refreshToken=', ''));
    const realNow = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + 30 * 60 * 1000);
    const rotated = await post('/auth/refresh', {}, { cookie: cookieOf(login).split(';')[0] });
    expect(rotated.status).toBe(200);
    const next = jwt.decode(cookieOf(rotated).split(';')[0].replace('refreshToken=', ''));
    expect([next.se, next.exp]).toEqual([original.se, original.exp]);
    clock.mockReturnValue(realNow + 61 * 60 * 1000);
    const late = await post('/auth/refresh', {}, { cookie: cookieOf(rotated).split(';')[0] });
    expect(late.status).toBe(401);
  });
  it('rejects an admin refresh token that has no session end', async () => {
    const admin = await User.findOne({ role: 'admin' });
    const { issueRefreshToken } = await import('../../services/tokenService.js');
    const token = await issueRefreshToken(admin._id, admin.tokenVersion ?? 0);
    expect((await post('/auth/refresh', {}, { cookie: `refreshToken=${token}` })).status).toBe(401);
  });
  it('treats a suspended admin like a wrong password', async () => {
    await User.updateOne({ role: 'admin' }, { $set: { suspendedAt: new Date() } });
    expect((await loginAdmin()).status).toBe(401);
  });
});
