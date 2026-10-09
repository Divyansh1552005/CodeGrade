import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { getRedisClient } from '../config/redis.js';

// Tests run with no network access to the real Redis instance and shouldn't
// depend on one: use the in-memory limiter (same .consume() contract) so the
// rate-limiting logic itself still gets exercised, just without Redis.
const isTest = process.env.NODE_ENV === 'test';

// Lazily construct the real limiter on first use rather than at import time:
// server.js loads .env via dotenv AFTER its static imports run (ESM import
// evaluation happens before the rest of the module body), so anything that
// reads process.env.REDIS_URL at module-load time would see it unset. Every
// other env-dependent module in this codebase (e.g. config/db.js) reads env
// lazily inside a function for the same reason — this matches that.
function makeLimiter({ keyPrefix, points, duration }) {
  let real;
  function ensure() {
    if (real) return real;
    const prefix = process.env.RATE_LIMIT_PREFIX ? `${process.env.RATE_LIMIT_PREFIX}:${keyPrefix}` : keyPrefix;
    real = isTest
      ? new RateLimiterMemory({ keyPrefix: prefix, points, duration })
      : new RateLimiterRedis({
          storeClient: getRedisClient(),
          keyPrefix: prefix,
          points,
          duration,
          // If Redis itself is unreachable, fail OPEN via an in-memory
          // fallback rather than locking every authenticated user out.
          insuranceLimiter: new RateLimiterMemory({
            keyPrefix: `ins:${prefix}`,
            points,
            duration,
          }),
        });
    return real;
  }
  return { consume: (key) => ensure().consume(key) };
}

// Basic abuse guard applied to every authenticated request (wired into
// requireAuth, so it covers all protected routes with no per-route setup).
const generalPerUserLimiter = makeLimiter({ keyPrefix: 'rl:general', points: 120, duration: 60 });

// Submission-specific: at most 2 every 60s, and 20 per rolling 24h, per student.
export const submissionMinuteLimiter = makeLimiter({
  keyPrefix: 'rl:submit:min',
  points: 2,
  duration: 60,
});
export const submissionDailyLimiter = makeLimiter({
  keyPrefix: 'rl:submit:day',
  points: 20,
  duration: 60 * 60 * 24,
});

/** "90s" / "5m" / "2h" — human-friendly retry hint for the error message. */
function formatRetry(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.ceil(seconds / 3600)}h`;
}

/**
 * Build an Express middleware that consumes one point from `limiter`, keyed
 * by the authenticated user (must run after requireAuth). On rejection,
 * responds 429 with a Retry-After header and a message built from the
 * retry-after seconds.
 */
export function rateLimit(limiter, message) {
  return async function rateLimitMiddleware(req, res, next) {
    const key = req.user?._id?.toString();
    if (!key) return next(); // always runs after requireAuth in practice

    try {
      await limiter.consume(key);
      return next();
    } catch (rejection) {
      // rate-limiter-flexible rejects with a RateLimiterRes when the limit is
      // hit, but with a real Error if the store itself breaks — don't mask
      // the latter as a 429.
      if (rejection instanceof Error) {
        return next(rejection);
      }
      const retryAfterSec = Math.max(1, Math.ceil((rejection.msBeforeNext || 1000) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message(formatRetry(retryAfterSec)) });
    }
  };
}

// Pre-built (not a factory call per-request) since it's invoked on every
// authenticated request from requireAuth.
export const generalRateLimit = rateLimit(
  generalPerUserLimiter,
  () => 'Too many requests — please slow down and try again shortly.'
);
