import { makeLimiter } from './rateLimit.js';
import { auditCoalesced } from '../services/audit.js';
import { isReservedEmail } from '../services/adminConfig.js';

// A stricter limit for anything that looks like an attempt at the admin account: a login with scope "admin",
// or any login for the reserved ADMIN_EMAIL. One bucket per client IP and one for the account as a whole,
// always on (not tied to the email flags). Attempts are counted, not only failures, so a correct password
// cannot be used to probe the limit. A refused attempt is audited like any other failed admin login.
// The IP bucket is the stricter one (5 per 15 minutes). The account bucket (20) caps guessing from many
// addresses at once; the trade-off is that someone flooding it can keep the real admin out for up to 15
// minutes. The password is long and random, and ADMIN_TOTP_SECRET adds a second factor, so locking is the
// safer failure than allowing unlimited guesses.
const WINDOW = 15 * 60;
const perIp = makeLimiter({ keyPrefix: 'rl:admin:ip', points: 5, duration: WINDOW });
const perAccount = makeLimiter({ keyPrefix: 'rl:admin:account', points: 20, duration: WINDOW });

/** For tests: forget the counters of the account bucket and of the given IPs. */
export async function resetAdminLoginLimits(ips = []) {
  await perAccount.reset('admin');
  for (const address of ips) await perIp.reset(address);
}

export const isAdminAttempt = (body) => body?.scope === 'admin' || isReservedEmail(body?.email);

export async function adminLoginLimit(req, res, next) {
  if (!isAdminAttempt(req.body)) return next();
  try {
    await perIp.consume(req.ip || 'unknown');
    await perAccount.consume('admin');
    return next();
  } catch (rejection) {
    if (rejection instanceof Error) return next(rejection);
    const seconds = Math.max(1, Math.ceil((rejection.msBeforeNext || 1000) / 1000));
    await auditCoalesced({ action: 'admin.login_failed', req, detail: 'rate limited' });
    res.set('Retry-After', String(seconds));
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
}
