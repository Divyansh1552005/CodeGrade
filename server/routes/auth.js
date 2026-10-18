import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAnyAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { httpError } from '../middleware/errorHandler.js';
import {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../services/tokenService.js';
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE } from '../utils/cookies.js';
import { registerSchema, loginSchema, emailOnlySchema, tokenSchema, resetPasswordSchema } from '../validation/schemas.js';
import { requireFeature } from '../middleware/featureGate.js';
import { authLimits } from '../middleware/authLimits.js';
import { paced } from '../middleware/paced.js';
import { authConfig, features } from '../config/features.js';
import { isVerified } from '../models/User.js';
import { consumeToken, issueToken, mayIssue, supersedeTokens } from '../services/emailTokens.js';
import { queueEmail } from '../services/emailJob.js';
import { revokeAllSessions } from '../services/tokenService.js';
import { maskEmail } from '../utils/maskEmail.js';
import { adminLockedOut, adminLoginLimit, clearAdminFailures, isAdminAttempt, recordAdminFailure } from '../middleware/adminLoginLimit.js';
import { makeLimiter, rateLimitBy } from '../middleware/rateLimit.js';
import { teacherAccess } from '../config/teacherAccess.js';
import TeacherApplication from '../models/TeacherApplication.js';
import { createApplication, hasRoomForApplication, markApplicationVisible } from '../services/teacherApplications.js';
import { isReservedEmail } from '../services/adminConfig.js';
import { audit, auditCoalesced } from '../services/audit.js';

const router = Router();

// Tokens travel in the request body, but a page that links away must never carry one in a Referer header.
router.use((_req, res, next) => { res.set('Referrer-Policy', 'no-referrer'); next(); });

const GENERIC = {
  signup: { message: 'Check your inbox. If the address can be used, we sent a verification link.' },
  resend: { message: 'If an account exists for that email and is not verified yet, we sent a new verification link.' },
  forgot: { message: 'If an account exists for that email, we sent a reset link.' },
};
const INVALID_LINK = { error: 'This link is invalid or has expired.', code: 'TOKEN_INVALID' };

// GET /auth/config  — public: which email features are on, so the login page knows what to offer.
router.get('/config', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(authConfig());
});

// Records the login time, at most once an hour, so a login costs a write only now and then.
const touchLastLogin = (userId) => User.updateOne(
  { _id: userId, $or: [{ lastLoginAt: { $exists: false } }, { lastLoginAt: { $lt: new Date(Date.now() - 3600 * 1000) } }] },
  { $set: { lastLoginAt: new Date() } },
);

// Issue a fresh verification token (older ones stop working) and queue the email.
async function sendVerification(user, { resubmitted = false, ignoreCooldown = false } = {}) {
  if (!(await mayIssue(user._id, 'verify', { ignoreCooldown }))) return false;
  const tokenId = await issueToken(user._id, 'verify');
  await queueEmail({ kind: 'verify-email', userId: user._id, tokenId, resubmitted });
  return true;
}

/**
 * Signup with email verification on. The answer is the same for a new address, an unverified one and a
 * verified one, so it cannot be used to find out who has an account:
 *  - new address: create the unverified user (a student, or a teacher_applicant with an application) and send
 *    the verification link;
 *  - unverified student or applicant: the new request replaces its name, password and account type (the account
 *    has no data and no session), retires the older links and sends a new one that says a new request was
 *    submitted;
 *  - any other account (verified, or holding another role): nothing changes, and the owner gets an
 *    "you already have an account" email.
 */
async function registerPending({ name, email, password, accountType, ...details }, req) {
  const address = String(email).toLowerCase();
  const passwordHash = await User.hashPassword(password); // always hashed, so the work done does not depend on the branch
  const teacher = accountType === 'teacher';
  const role = teacher ? 'teacher_applicant' : 'student';
  let user = await User.findOne({ email: address });
  if (!user) {
    try {
      user = await User.create({ name, email: address, passwordHash, role, emailVerified: false });
      if (teacher) await createApplication(user, details, { verified: false, req });
      await sendVerification(user, { ignoreCooldown: true });
      return;
    } catch (err) {
      if (err.code !== 11000) throw err;
      user = await User.findOne({ email: address }); // a parallel signup won the race
    }
  }
  if (user && user.emailVerified === false) {
    // The filter is what keeps a verified account, and any account with another role, untouched.
    const replaced = await User.findOneAndUpdate(
      { _id: user._id, emailVerified: false, role: { $in: ['student', 'teacher_applicant'] } },
      { $set: { name, passwordHash, role } }, { new: true },
    );
    if (replaced) {
      await TeacherApplication.deleteOne({ userId: replaced._id, status: 'pending' }); // a new request replaces the old one
      if (teacher) await createApplication(replaced, details, { verified: false, req });
      await sendVerification(replaced, { resubmitted: true, ignoreCooldown: true });
      return;
    }
  }
  if (user) await queueEmail({ kind: 'account-exists', userId: user._id });
}

const findUserById = (id) => User.findById(id);

const TEACHER_SIGNUPS_FULL = { error: 'Teacher applications are not being accepted right now. Try again later.', code: 'TEACHER_APPLICATIONS_FULL' };

// Teacher signups are limited per IP, always (not tied to the email flags).
let teacherSignupLimiter; // built on first use, after the environment is loaded
const teacherSignupLimit = (req, res, next) => {
  teacherSignupLimiter ??= makeLimiter({ keyPrefix: 'rl:signup:teacher', points: teacherAccess().signupsPerIpPerHour, duration: 3600 });
  return rateLimitBy(teacherSignupLimiter, (r) => (r.body?.accountType === 'teacher' ? r.ip || 'unknown' : null), (wait) => `Too many teacher signups from this network. Try again in ${wait}.`)(req, res, next);
};

// POST /auth/register  { name, email, password, accountType, organization?, note?, degree?, degreeLink?, proofLinks? }
// accountType "student" creates a student. "teacher" creates a teacher_applicant: no access to anything
// until an admin approves. The schema is strict, so a `role` or any other unknown key is a 400.
router.post('/register', ...authLimits('register'), validate(registerSchema), teacherSignupLimit, async (req, res, next) => {
  try {
    const { name, email, password, accountType, ...details } = req.body;
    const teacher = accountType === 'teacher';

    // The admin address is reserved. It answers like any account that already exists and never changes.
    if (isReservedEmail(email)) {
      if (!features.emailVerification()) throw httpError(409, 'Resource already exists');
      return await paced(async () => ({ status: 202, body: { ...GENERIC.signup, email: String(email).toLowerCase() } }))(req, res, next);
    }

    if (teacher && !(await hasRoomForApplication())) return res.status(503).json(TEACHER_SIGNUPS_FULL);

    if (features.emailVerification()) {
      return await paced(async () => {
        await registerPending({ name, email, password, accountType, ...details }, req);
        return { status: 202, body: { ...GENERIC.signup, email: String(email).toLowerCase() } };
      })(req, res, next);
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ name, email, passwordHash, role: teacher ? 'teacher_applicant' : 'student' });
    // Without email verification there is nothing to wait for: the application is visible straight away.
    if (teacher) await createApplication(user, details, { verified: true, req });
    const { accessToken, refreshToken } = await issueTokenPair(user);
    setRefreshCookie(res, refreshToken);
    return res.status(201).json({ user: user.toJSON(), accessToken });
  } catch (err) {
    return next(err);
  }
});

// Hash compared when the account does not exist, so an unknown address costs the same bcrypt work as a real one.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/**
 * Login for the admin account, or any attempt that asks for scope "admin". Every failure is the same 401 as
 * a wrong password, whatever the reason (wrong password, not an admin, suspended, locked out), and does the
 * same work, so neither the answer nor the timing says which one it was. Failures are audited (coalesced per
 * IP and minute) without the attempted password; a failure creates no session, no refresh token and no
 * lastLoginAt. Five failures against the admin address lock the account for 15 minutes (see adminLoginLimit).
 */
async function adminLogin(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  const targetsAdmin = isReservedEmail(email) || user?.role === 'admin';
  const locked = targetsAdmin && (await adminLockedOut());
  let reason = null;
  if (locked) reason = 'locked out';
  else if (!user) reason = 'unknown account';
  else if (!passwordOk) reason = 'wrong password';
  else if (user.role !== 'admin' || user.suspendedAt) reason = user.suspendedAt ? 'suspended' : 'not an admin';
  if (reason) {
    if (targetsAdmin && !locked) await recordAdminFailure();
    await auditCoalesced({ action: 'admin.login_failed', target: user ?? undefined, req, detail: reason });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  await clearAdminFailures();
  await touchLastLogin(user._id);
  const { accessToken, refreshToken } = await issueTokenPair(user);
  setRefreshCookie(res, refreshToken);
  await audit({ action: 'admin.login', actor: user, req });
  return res.json({ user: user.toJSON(), accessToken });
}

// POST /auth/login  { email, password, scope? }
router.post('/login', ...authLimits('login'), validate(loginSchema), adminLoginLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (isAdminAttempt(req.body)) return await adminLogin(req, res);
    const user = await User.findOne({ email: String(email).toLowerCase() });
    // With email verification on, an unknown address still pays for one bcrypt compare, so the time does not give it away.
    if (!user && features.emailVerification()) await User.hashPassword(password);
    if (!user || !(await user.comparePassword(password))) {
      throw httpError(401, 'Invalid credentials');
    }
    // A suspended account looks exactly like a wrong password.
    if (user.suspendedAt) throw httpError(401, 'Invalid credentials');
    // Only after the password is right, so the code cannot be used to probe which emails are registered.
    if (features.emailVerification() && !isVerified(user)) {
      return res.status(403).json({ error: 'Verify your email address before logging in.', code: 'EMAIL_NOT_VERIFIED' });
    }
    await touchLastLogin(user._id);
    const { accessToken, refreshToken } = await issueTokenPair(user);
    setRefreshCookie(res, refreshToken);
    return res.json({ user: user.toJSON(), accessToken });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/verify-email  { token }  — POST, not GET, so mail scanners and link prefetchers cannot use the token.
router.post('/verify-email', requireFeature('emailVerification'), ...authLimits('verify-email'), validate(tokenSchema), async (req, res, next) => {
  try {
    const used = await consumeToken(req.body.token, 'verify');
    if (!used) return res.status(400).json(INVALID_LINK);
    await User.updateOne({ _id: used.userId, emailVerified: { $ne: true } }, { $set: { emailVerified: true, emailVerifiedAt: new Date() } });
    await supersedeTokens(used.userId, 'verify');
    // A teacher applicant becomes visible to the admin only now, once the address is proven.
    const verified = await User.findById(used.userId).select('role');
    if (verified?.role === 'teacher_applicant') await markApplicationVisible(used.userId);
    return res.json({ message: 'Your email address is verified. You can log in now.' });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/resend-verification  { email }  — the same answer whatever the account's state. The cooldown
// and the hourly cap are enforced silently for the same reason; only the per-IP limit can answer 429.
router.post('/resend-verification', requireFeature('emailVerification'), ...authLimits('resend-verification'), validate(emailOnlySchema), paced(async (req) => {
  const user = isReservedEmail(req.body.email) ? null : await User.findOne({ email: req.body.email.toLowerCase() });
  if (user && user.emailVerified === false) await sendVerification(user);
  return { body: GENERIC.resend };
}));

// POST /auth/forgot-password  { email }  — an unverified account gets a verification email instead of a reset.
router.post('/forgot-password', requireFeature('passwordReset'), ...authLimits('forgot-password'), validate(emailOnlySchema), paced(async (req) => {
  const user = isReservedEmail(req.body.email) ? null : await User.findOne({ email: req.body.email.toLowerCase() });
  if (user) {
    if (features.emailVerification() && user.emailVerified === false) await sendVerification(user);
    else if (await mayIssue(user._id, 'reset')) {
      const tokenId = await issueToken(user._id, 'reset');
      await queueEmail({ kind: 'password-reset', userId: user._id, tokenId });
    }
  }
  return { body: GENERIC.forgot };
}));

// POST /auth/reset-password  { token, password }
router.post('/reset-password', requireFeature('passwordReset'), ...authLimits('reset-password'), validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const used = await consumeToken(req.body.token, 'reset');
    if (!used) return res.status(400).json(INVALID_LINK);
    const user = await User.findById(used.userId);
    if (!user) return res.status(400).json(INVALID_LINK);
    const passwordHash = await User.hashPassword(req.body.password);
    await User.updateOne({ _id: user._id }, { $set: { passwordHash } });
    // Every session ends: the version bump kills access tokens, and every refresh token is revoked.
    await revokeAllSessions(user._id);
    await supersedeTokens(user._id, 'reset');
    await queueEmail({ kind: 'password-changed', userId: user._id });
    req.log?.info('auth.password_reset', { userId: String(user._id), email: maskEmail(user.email) });
    clearRefreshCookie(res);
    return res.json({ message: 'Your password was changed. Log in with the new password.' });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/refresh  — rotate (single-use) using the refresh cookie; returns a
// fresh access token in the body and sets a new refresh cookie.
router.post('/refresh', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    const { accessToken, refreshToken } = await rotateRefreshToken(rawToken, findUserById);
    setRefreshCookie(res, refreshToken);
    return res.json({ accessToken });
  } catch (err) {
    // On any refresh failure, clear the stale cookie so the client logs out cleanly.
    clearRefreshCookie(res);
    return next(err);
  }
});

// POST /auth/logout  — revoke the refresh token and clear the cookie.
router.post('/logout', async (req, res, next) => {
  try {
    await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

// GET /auth/me
router.get('/me', requireAnyAuth, (req, res) => {
  res.json({ user: req.user.toJSON() });
});

export default router;
