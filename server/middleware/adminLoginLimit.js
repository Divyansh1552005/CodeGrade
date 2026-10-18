import { makeLimiter } from './rateLimit.js';
import { auditCoalesced } from '../services/audit.js';
import { isReservedEmail } from '../services/adminConfig.js';

// Two limits on admin logins, both always on (not tied to the email flags):
//  - per client IP: 5 attempts in 15 minutes, then 429 with Retry-After (the login page shows its own message);
//  - on the admin account: 5 FAILED attempts in 15 minutes lock the account out. While locked, every attempt,
//    even with the right password, gets the same generic 401 as a wrong one: no 429, no hint, no email. The
//    lock is not extended by further attempts and ends by itself 15 minutes after the first failure.
// Only failures against the admin address count towards the lockout, so nobody can lock the admin out by
// typing their own wrong password at the admin page. The trade-off of any lockout stays: someone who keeps
// guessing the admin address can keep the admin out for up to 15 minutes at a time.
const WINDOW = 15 * 60;
const MAX_FAILURES = 5;
const perIp = makeLimiter({ keyPrefix: 'rl:admin:ip', points: 5, duration: WINDOW });
const failures = makeLimiter({ keyPrefix: 'rl:admin:failures', points: MAX_FAILURES, duration: WINDOW });
const ACCOUNT = 'admin';

export const isAdminAttempt = (body) => body?.scope === 'admin' || isReservedEmail(body?.email);

export const adminLockedOut = async () => (await failures.used(ACCOUNT)) >= MAX_FAILURES;
/** How many failures are counted and how long until they expire (for tests and diagnostics). */
export const adminFailureStatus = async () => ({ used: await failures.used(ACCOUNT), ttlMs: await failures.ttlMs(ACCOUNT) });
export const clearAdminFailures = () => failures.reset(ACCOUNT);
/** Counts one failure. The counter stops at the limit, so a locked account is not locked for longer. */
export async function recordAdminFailure() {
  if (await adminLockedOut()) return;
  try { await failures.consume(ACCOUNT); } catch { /* the limit was just reached */ }
}

/** For tests: forget the failure counter and the counters of the given IPs. */
export async function resetAdminLoginLimits(ips = []) {
  await failures.reset(ACCOUNT);
  for (const address of ips) await perIp.reset(address);
}

export async function adminLoginLimit(req, res, next) {
  if (!isAdminAttempt(req.body)) return next();
  try {
    await perIp.consume(req.ip || 'unknown');
    return next();
  } catch (rejection) {
    if (rejection instanceof Error) return next(rejection);
    const seconds = Math.max(1, Math.ceil((rejection.msBeforeNext || 1000) / 1000));
    await auditCoalesced({ action: 'admin.login_failed', req, detail: 'rate limited' });
    res.set('Retry-After', String(seconds));
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
}
