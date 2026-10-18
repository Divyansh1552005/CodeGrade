import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import User from '../../models/User.js';
import EmailToken from '../../models/EmailToken.js';
import WorkItem from '../../models/WorkItem.js';
import RefreshToken from '../../models/RefreshToken.js';
import { processWork } from '../../services/workProcessor.js';
import { setMailTransport, MailError } from '../../services/mail/mailService.js';
import { issueToken, deriveToken } from '../../services/emailTokens.js';

const app = createApp();
const saved = { ...process.env };
const transport = jest.fn();
let n = 0;
let emailSeq = 0;
const nextIp = () => { n += 1; return `10.${(n >> 8) & 255}.${n & 255}.7`; };
const post = (path, body, { ip = nextIp(), headers = {}, cookie } = {}) => {
  const req = request(app).post(path).set('X-Forwarded-For', ip);
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  if (cookie) req.set('Cookie', cookie);
  return req.send(body);
};
const newEmail = () => { emailSeq += 1; return `user${emailSeq}@example.com`; };
const signupBody = (email = newEmail(), extra = {}) => ({ name: 'Ada', email, password: 'password123', accountType: 'student', ...extra });
const signup = (body = signupBody(), opts) => post('/auth/register', body, opts);
let sentBefore = 0;
/** Run every unfinished email job and return the messages the transport received since the last call. */
async function deliver() {
  for (const work of await WorkItem.find({ type: 'send-email', status: { $ne: 'completed' } }).sort({ createdAt: 1 })) {
    await processWork({ data: { workItemId: work.id }, attemptsMade: 0, opts: { attempts: 5 } });
  }
  const fresh = transport.mock.calls.slice(sentBefore).map((c) => c[0]);
  sentBefore = transport.mock.calls.length;
  return fresh;
}
const tokenIn = (message) => message.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
const clearCooldown = () => EmailToken.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 5 * 60000) } });
async function verifiedUser(password = 'password123') {
  const email = newEmail();
  await User.create({ name: 'Vera', email, passwordHash: await User.hashPassword(password), role: 'student', emailVerified: true });
  return email;
}
const login = (email, password = 'password123') => post('/auth/login', { email, password });

beforeEach(() => {
  process.env = { ...saved, FEATURE_EMAIL_VERIFICATION: 'true', FEATURE_PASSWORD_RESET: 'true', EMAIL_TOKEN_SECRET: 'a-test-secret-that-is-at-least-32-characters', APP_BASE_URL: 'https://app.example.com', MAIL_FROM: 'CodeGrade <no-reply@example.com>' };
  transport.mockReset().mockResolvedValue({ id: 'msg' });
  sentBefore = 0;
  setMailTransport(transport);
});
afterEach(() => { process.env = { ...saved }; setMailTransport(undefined); });

describe('signup and login', () => {
  it('creates an unverified user, queues one email and starts no session', async () => {
    const body = signupBody();
    const res = await signup(body);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ message: expect.any(String), email: body.email });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(transport).not.toHaveBeenCalled(); // nothing is sent inside the request
    expect((await User.findOne({ email: body.email })).emailVerified).toBe(false);
    expect(await WorkItem.countDocuments({ type: 'send-email' })).toBe(1);
    const [mail] = await deliver();
    expect(mail.to).toBe(body.email);
    expect(mail.subject).toBe('Verify your email for CodeGrade');
  });
  it('is not slowed or failed by a provider outage', async () => {
    transport.mockRejectedValue(new MailError('down', { permanent: false, status: 503 }));
    const res = await signup();
    expect(res.status).toBe(202);
    expect(transport).not.toHaveBeenCalled();
  });
  it('blocks login until verified, and reveals EMAIL_NOT_VERIFIED only after the right password', async () => {
    const body = signupBody();
    await signup(body);
    const wrong = await login(body.email, 'not-the-password');
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: 'Invalid credentials' });
    const unknown = await login('nobody@example.com');
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    const blocked = await login(body.email);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(blocked.headers['set-cookie']).toBeUndefined();
    const [mail] = await deliver();
    expect((await post('/auth/verify-email', { token: tokenIn(mail) })).status).toBe(200);
    expect((await login(body.email)).status).toBe(200);
  });
  it('treats an account with no emailVerified field as verified', async () => {
    const email = newEmail();
    await User.collection.insertOne({ name: 'Old', email, passwordHash: await User.hashPassword('password123'), role: 'student', createdAt: new Date(), updatedAt: new Date() });
    expect((await login(email)).status).toBe(200);
  });
  it('rejects a password over 72 bytes at signup', async () => {
    expect((await signup(signupBody(newEmail(), { password: 'é'.repeat(37) }))).status).toBe(400);
  });
});

describe('signup with an address that already exists', () => {
  it('answers a new, an unverified and a verified address the same way', async () => {
    const fresh = await signup(signupBody('same-shape@example.com'));
    const unverified = await signup(signupBody('same-shape@example.com'));
    const verifiedEmail = await verifiedUser();
    const verified = await signup(signupBody(verifiedEmail));
    expect([fresh.status, unverified.status, verified.status]).toEqual([202, 202, 202]);
    expect(Object.keys(unverified.body)).toEqual(Object.keys(fresh.body));
    expect(verified.body.message).toBe(fresh.body.message);
  });
  it('replaces an unverified signup, retires its older links and says a new request was submitted', async () => {
    const email = 'pending@example.com';
    await signup(signupBody(email, { name: 'First', password: 'first-password' }));
    const [first] = await deliver();
    await signup(signupBody(email, { name: 'Second', password: 'second-password' }));
    const [second] = await deliver();
    const user = await User.findOne({ email });
    expect([user.name, user.role]).toEqual(['Second', 'student']);
    expect(await user.comparePassword('second-password')).toBe(true);
    expect(second.text).toContain('A new signup request was submitted for this email address');
    expect(second.text).toContain('If you did not request this, you can ignore this email');
    expect((await post('/auth/verify-email', { token: tokenIn(first) })).status).toBe(400);
    expect((await post('/auth/verify-email', { token: tokenIn(second) })).status).toBe(200);
    expect((await login(email, 'second-password')).status).toBe(200);
    expect(await User.countDocuments({ email })).toBe(1);
  });
  it('never touches a verified account and sends its owner a notice with no link', async () => {
    const email = await verifiedUser('real-password');
    const before = await User.findOne({ email });
    await signup(signupBody(email, { name: 'Attacker', password: 'attacker-password', accountType: 'teacher', organization: 'Evil Corp' }));
    const after = await User.findOne({ email });
    expect([after.name, after.passwordHash, after.role, after.emailVerified]).toEqual([before.name, before.passwordHash, before.role, true]);
    const [mail] = await deliver();
    expect(mail.subject).toBe('You already have a CodeGrade account');
    expect(mail.text).not.toMatch(/https?:\/\//);
    expect(await EmailToken.countDocuments({ userId: before._id })).toBe(0);
    expect((await login(email, 'real-password')).status).toBe(200);
  });
  it('lets parallel signups for one new address end with one user', async () => {
    const email = 'race@example.com';
    const results = await Promise.all([1, 2, 3].map(() => signup(signupBody(email))));
    expect(results.map((r) => r.status)).toEqual([202, 202, 202]);
    expect(await User.countDocuments({ email })).toBe(1);
  });
});

describe('verify email', () => {
  const pending = async () => { const body = signupBody(); await signup(body); const [mail] = await deliver(); return { body, mail, token: tokenIn(mail) }; };
  it('works once and does not log the user in', async () => {
    const { body, token } = await pending();
    const ok = await post('/auth/verify-email', { token });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie']).toBeUndefined();
    expect(ok.body.accessToken).toBeUndefined();
    const user = await User.findOne({ email: body.email });
    expect(user.emailVerified).toBe(true);
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    const again = await post('/auth/verify-email', { token });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('TOKEN_INVALID');
  });
  it('fails for tampered, expired and unknown tokens', async () => {
    const { body, token } = await pending();
    expect((await post('/auth/verify-email', { token: `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}` })).status).toBe(400);
    expect((await post('/auth/verify-email', { token: 'nonsense' })).status).toBe(400);
    expect((await post('/auth/verify-email', {})).status).toBe(400);
    await EmailToken.updateOne({ userId: (await User.findOne({ email: body.email }))._id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await post('/auth/verify-email', { token })).status).toBe(400);
    expect((await User.findOne({ email: body.email })).emailVerified).toBe(false);
  });
  it('succeeds for only one of several parallel requests with the same token', async () => {
    const { token } = await pending();
    const results = await Promise.all(Array.from({ length: 6 }, () => post('/auth/verify-email', { token })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(5);
  });
  it('is not available as a GET, so a link prefetcher cannot use a token', async () => {
    const { token } = await pending();
    expect((await request(app).get(`/auth/verify-email?token=${token}`)).status).toBe(404);
    expect((await User.findOne({}).sort({ createdAt: -1 })).emailVerified).toBe(false);
  });
  it('retires older links when a new one is issued', async () => {
    const { body, token } = await pending();
    await clearCooldown();
    await post('/auth/resend-verification', { email: body.email });
    const [fresh] = await deliver();
    expect((await post('/auth/verify-email', { token })).status).toBe(400);
    expect((await post('/auth/verify-email', { token: tokenIn(fresh) })).status).toBe(200);
  });
  it('retires every other outstanding link once the address is verified', async () => {
    const { body, token } = await pending();
    const user = await User.findOne({ email: body.email });
    const spare = deriveToken(await issueToken(user._id, 'verify'));
    await EmailToken.updateMany({ tokenHash: { $ne: '' } }, { $unset: { supersededAt: 1 } }); // both live again
    expect((await post('/auth/verify-email', { token })).status).toBe(200);
    expect((await post('/auth/verify-email', { token: spare })).status).toBe(400);
  });
});

describe('resend verification', () => {
  const shape = (r) => [r.status, r.body];
  it('answers the same for unknown, verified and unverified emails and sends only for the unverified one', async () => {
    const pendingEmail = newEmail();
    await signup(signupBody(pendingEmail));
    await deliver();
    await clearCooldown();
    const verifiedEmail = await verifiedUser();
    const [unverified, verified, unknown] = [await post('/auth/resend-verification', { email: pendingEmail }), await post('/auth/resend-verification', { email: verifiedEmail }), await post('/auth/resend-verification', { email: 'ghost@example.com' })];
    expect(shape(verified)).toEqual(shape(unverified));
    expect(shape(unknown)).toEqual(shape(unverified));
    const mails = await deliver();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(pendingEmail);
  });
  it('enforces the 60 second cooldown silently, with the same response', async () => {
    const email = newEmail();
    await signup(signupBody(email));
    await deliver();
    const early = await post('/auth/resend-verification', { email });
    expect(early.status).toBe(200);
    expect(await deliver()).toHaveLength(0);
    await clearCooldown();
    await post('/auth/resend-verification', { email });
    expect(await deliver()).toHaveLength(1);
  });
  it('enforces the hourly cap per account silently, from the stored tokens', async () => {
    const email = newEmail();
    await signup(signupBody(email));
    await deliver();
    const user = await User.findOne({ email });
    for (let i = 0; i < 4; i += 1) await EmailToken.create({ userId: user._id, type: 'verify', tokenId: `old${i}`, tokenHash: `old-hash-${i}`, expiresAt: new Date(Date.now() + 1e6), supersededAt: new Date() });
    await clearCooldown();
    const res = await post('/auth/resend-verification', { email });
    expect(res.status).toBe(200);
    expect(await deliver()).toHaveLength(0); // 5 tokens in the last hour: no sixth
    expect(await EmailToken.countDocuments({ userId: user._id, type: 'verify' })).toBe(5);
  });
  it('limits one IP to the hourly cap, answering 429 whatever the email', async () => {
    const ip = nextIp();
    const statuses = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await post('/auth/resend-verification', { email: `ip${i}@example.com` }, { ip })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
  });
  it('limits one email across many IPs', async () => {
    const email = newEmail();
    const statuses = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await post('/auth/resend-verification', { email })).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});

describe('forgot password', () => {
  it('answers identically, in status and body, for verified, unknown and unverified accounts', async () => {
    const verifiedEmail = await verifiedUser();
    const pendingEmail = newEmail();
    await signup(signupBody(pendingEmail));
    const a = await post('/auth/forgot-password', { email: verifiedEmail });
    const b = await post('/auth/forgot-password', { email: 'ghost@example.com' });
    const c = await post('/auth/forgot-password', { email: pendingEmail });
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    expect(b.body).toEqual(a.body);
    expect(c.body).toEqual(a.body);
  });
  it('sends a reset to a verified account, a verification to an unverified one, and nothing to an unknown address', async () => {
    const verifiedEmail = await verifiedUser();
    const pendingEmail = newEmail();
    await signup(signupBody(pendingEmail));
    await deliver();
    await clearCooldown();
    await post('/auth/forgot-password', { email: verifiedEmail });
    await post('/auth/forgot-password', { email: pendingEmail });
    await post('/auth/forgot-password', { email: 'ghost@example.com' });
    const mails = await deliver();
    expect(mails.map((m) => [m.to, m.subject]).sort()).toEqual([[pendingEmail, 'Verify your email for CodeGrade'], [verifiedEmail, 'Reset your CodeGrade password']].sort());
  });
  it('stores only the hash of the token and never returns it', async () => {
    const email = await verifiedUser();
    const res = await post('/auth/forgot-password', { email });
    const [mail] = await deliver();
    const token = tokenIn(mail);
    expect(JSON.stringify(res.body)).not.toContain(token);
    const rows = JSON.stringify(await EmailToken.find().lean()) + JSON.stringify(await WorkItem.find().lean());
    expect(rows).not.toContain(token);
  });
  it('invalidates the first token when a second request is made', async () => {
    const email = await verifiedUser();
    await post('/auth/forgot-password', { email });
    const [first] = await deliver();
    await clearCooldown();
    await post('/auth/forgot-password', { email });
    const [second] = await deliver();
    expect((await post('/auth/reset-password', { token: tokenIn(first), password: 'new-password-1' })).status).toBe(400);
    expect((await post('/auth/reset-password', { token: tokenIn(second), password: 'new-password-1' })).status).toBe(200);
  });
  it('takes the same time for an existing and an unknown account', async () => {
    process.env.AUTH_RESPONSE_FLOOR_MS = '250';
    const email = await verifiedUser();
    for (const address of [email, 'ghost@example.com']) {
      const started = Date.now();
      await post('/auth/forgot-password', { email: address });
      expect(Date.now() - started).toBeGreaterThanOrEqual(240);
    }
  });
});

describe('reset password', () => {
  async function requestReset(password = 'old-password-1') {
    const email = await verifiedUser(password);
    await post('/auth/forgot-password', { email });
    const [mail] = await deliver();
    return { email, token: tokenIn(mail) };
  }
  it('changes the password once, queues a notice without a link and ends every session', async () => {
    const { email, token } = await requestReset();
    const session = await login(email, 'old-password-1');
    const cookie = session.headers['set-cookie'].find((c) => c.startsWith('refreshToken=')).split(';')[0];
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${session.body.accessToken}`)).status).toBe(200);
    const res = await post('/auth/reset-password', { token, password: 'new-password-1' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect((await post('/auth/reset-password', { token, password: 'new-password-2' })).status).toBe(400);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${session.body.accessToken}`)).status).toBe(401);
    expect((await post('/auth/refresh', {}, { cookie })).status).toBe(401);
    expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
    expect((await login(email, 'old-password-1')).status).toBe(401);
    expect((await login(email, 'new-password-1')).status).toBe(200);
    const [notice] = await deliver();
    expect(notice.subject).toBe('Your CodeGrade password was changed');
    expect(notice.text).not.toMatch(/https?:\/\//);
  });
  it('fails for an expired, tampered or unknown token', async () => {
    const { email, token } = await requestReset();
    expect((await post('/auth/reset-password', { token: `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, password: 'new-password-1' })).status).toBe(400);
    await EmailToken.updateOne({ type: 'reset' }, { expiresAt: new Date(Date.now() - 1000) });
    const res = await post('/auth/reset-password', { token, password: 'new-password-1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_INVALID');
    expect((await login(email, 'old-password-1')).status).toBe(200);
  });
  it('rejects a weak or over-long password without using up the token', async () => {
    const { token } = await requestReset();
    expect((await post('/auth/reset-password', { token, password: '123' })).status).toBe(400);
    expect((await post('/auth/reset-password', { token, password: 'é'.repeat(37) })).status).toBe(400);
    expect((await post('/auth/reset-password', { token, password: 'a-fine-password' })).status).toBe(200);
  });
  it('lets only one of several parallel requests with the same token change the password', async () => {
    const { token } = await requestReset();
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => post('/auth/reset-password', { token, password: `parallel-password-${i}` })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });
});

describe('links and headers', () => {
  it('build every link from APP_BASE_URL even when the Host header is spoofed', async () => {
    await signup(signupBody(), { headers: { Host: 'evil.example.net', 'X-Forwarded-Host': 'evil.example.net', Origin: 'https://evil.example.net' } });
    const email = await verifiedUser();
    await post('/auth/forgot-password', { email }, { headers: { Host: 'evil.example.net', 'X-Forwarded-Host': 'evil.example.net' } });
    const mails = await deliver();
    expect(mails).toHaveLength(2);
    for (const mail of mails) {
      expect(mail.text).toMatch(/https:\/\/app\.example\.com\/(verify-email|reset-password)\?token=/);
      expect(`${mail.html}${mail.text}`).not.toContain('evil.example.net');
    }
  });
  it('sets Referrer-Policy: no-referrer on the auth routes', async () => {
    expect((await post('/auth/verify-email', { token: 'x' })).headers['referrer-policy']).toBe('no-referrer');
  });
  it('serves a public, cacheable config with only the two flags', async () => {
    const res = await request(app).get('/auth/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ emailVerification: true, passwordReset: true });
    expect(res.headers['cache-control']).toMatch(/max-age=\d+/);
  });
});

describe('with both flags off', () => {
  beforeEach(() => { process.env.FEATURE_EMAIL_VERIFICATION = 'false'; process.env.FEATURE_PASSWORD_RESET = 'false'; });
  it('signs up and logs in exactly as before, and queues nothing', async () => {
    const body = signupBody();
    const res = await signup(body);
    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.email).toBe(body.email);
    expect(res.headers['set-cookie'].some((c) => c.startsWith('refreshToken='))).toBe(true);
    expect((await signup(body)).status).toBe(409);
    expect((await login(body.email)).status).toBe(200);
    expect((await login(body.email, 'wrong-password')).body).toEqual({ error: 'Invalid credentials' });
    expect(await WorkItem.countDocuments()).toBe(0);
    expect(await EmailToken.countDocuments()).toBe(0);
  });
  it('lets a user flagged unverified log in while the feature is off, and does not limit the auth routes', async () => {
    const email = newEmail();
    await User.create({ name: 'U', email, passwordHash: await User.hashPassword('password123'), role: 'student', emailVerified: false });
    const ip = nextIp();
    for (let i = 0; i < 12; i += 1) expect((await post('/auth/login', { email, password: 'password123' }, { ip })).status).toBe(200);
  });
  it('answers 404 on the email routes and reports both flags off', async () => {
    for (const path of ['/auth/verify-email', '/auth/resend-verification', '/auth/forgot-password', '/auth/reset-password']) {
      expect((await post(path, { email: 'a@b.co', token: 'x', password: 'password123' })).status).toBe(404);
    }
    expect((await request(app).get('/auth/config')).body).toEqual({ emailVerification: false, passwordReset: false });
  });
});

describe('password reset alone', () => {
  it('works for every account while verification is off, and sends no verification mail', async () => {
    process.env.FEATURE_EMAIL_VERIFICATION = 'false';
    const email = newEmail();
    await User.create({ name: 'U', email, passwordHash: await User.hashPassword('password123'), role: 'student', emailVerified: false });
    await post('/auth/forgot-password', { email });
    const [mail] = await deliver();
    expect(mail.subject).toBe('Reset your CodeGrade password');
    expect((await post('/auth/reset-password', { token: tokenIn(mail), password: 'new-password-1' })).status).toBe(200);
  });
});

describe('signup role with email verification on', () => {
  it('rejects a role in the body', async () => {
    const body = signupBody(newEmail(), { role: 'teacher' });
    expect((await signup(body)).status).toBe(400);
    expect(await User.countDocuments({ email: body.email })).toBe(0);
  });
  it('does not touch the role or name of an unverified account that holds another role', async () => {
    const email = newEmail();
    await signup(signupBody(email));
    await User.updateOne({ email }, { $set: { role: 'teacher' } }); // as if an admin had set it
    await signup(signupBody(email, { name: 'Again' }));
    const after = await User.findOne({ email });
    expect([after.name, after.role]).toEqual(['Ada', 'teacher']);
  });
});
