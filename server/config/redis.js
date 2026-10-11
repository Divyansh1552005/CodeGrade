import Redis from 'ioredis';

let client;

/**
 * Lazily create a singleton ioredis client from REDIS_URL. Lazy (rather than
 * connected eagerly at boot, unlike Mongo in config/db.js) so a Redis outage
 * doesn't prevent the API from starting — it only affects the first request
 * that needs rate limiting.
 */
export function getRedisClient() {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not set');
  }
  client = new Redis(url, {
    // A dead Redis must reach rateLimit's insurance limiter quickly. The
    // default unbounded reconnect/retry behavior can otherwise hold an HTTP
    // request while ioredis reconnects for many seconds. Keep its small
    // initial-connect queue so healthy startup requests reach shared Redis.
    connectTimeout: 1500,
    commandTimeout: 1500,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 100, 500),
  });
  client.on('error', (err) => console.error('Redis error:', err.message));
  return client;
}
