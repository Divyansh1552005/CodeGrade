import crypto from 'node:crypto';
import { makeLimiter, rateLimitBy } from './rateLimit.js';
import { mailConfig, emailFeaturesOn } from '../config/mail.js';

// Limits for the routes that have no signed-in user. Each route gets one limit per client IP and one per
// email address (hashed, and counted whether or not the account exists, so a 429 reveals nothing).
// They are active only while an email flag is on: with both off the auth routes behave as before.
// Redis is the shared store; if it is unreachable rate-limiter-flexible falls back to an in-memory
// limiter in each process, so the limits still apply (per process) instead of opening up. Fail-closed
// would lock everyone out of login on a Redis outage, so it is not used.
const HOUR = 3600;
const table = () => {
  const cap = mailConfig().resendHourlyCap;
  return {
    register: { ip: [10, HOUR], email: [5, HOUR] },
    login: { ip: [30, 15 * 60], email: [10, 15 * 60] },
    'verify-email': { ip: [30, HOUR] },
    'resend-verification': { ip: [cap, HOUR], email: [cap, HOUR] },
    'forgot-password': { ip: [cap, HOUR], email: [cap, HOUR] },
    'reset-password': { ip: [20, HOUR] },
  };
};
const LIMITERS = {};
function limiterFor(route, scope) {
  const id = `${route}:${scope}`;
  if (!LIMITERS[id]) {
    const [points, duration] = table()[route][scope];
    LIMITERS[id] = makeLimiter({ keyPrefix: `rl:auth:${id}`, points, duration });
  }
  return LIMITERS[id];
}

const MESSAGE = (wait) => `Too many attempts. Try again in ${wait}.`;
const whenOn = (middleware) => (req, res, next) => (emailFeaturesOn() ? middleware(req, res, next) : next());
const emailKey = (req) => {
  const email = req.body?.email;
  return typeof email === 'string' && email ? crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex') : null;
};

/** The limits for one route, as an array to spread into the route definition: [ip, email?]. */
export function authLimits(route) {
  const chain = [whenOn((req, res, next) => rateLimitBy(limiterFor(route, 'ip'), (r) => r.ip, MESSAGE)(req, res, next))];
  if (table()[route].email) chain.push(whenOn((req, res, next) => rateLimitBy(limiterFor(route, 'email'), emailKey, MESSAGE)(req, res, next)));
  return chain;
}
