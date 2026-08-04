import { describe, it, expect, jest } from '@jest/globals';
import {
  rateLimit,
  submissionMinuteLimiter,
  submissionDailyLimiter,
} from '../../middleware/rateLimit.js';

function mockRes() {
  return {
    set: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('rateLimit middleware wrapper', () => {
  it('calls next() when the limiter allows the request', async () => {
    const limiter = { consume: jest.fn().mockResolvedValue({}) };
    const middleware = rateLimit(limiter, () => 'blocked');
    const req = { user: { _id: 'u1' } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(limiter.consume).toHaveBeenCalledWith('u1');
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 429 with Retry-After and the built message when the limiter rejects', async () => {
    // rate-limiter-flexible rejects with a RateLimiterRes (not an Error) on
    // limit-exceeded — msBeforeNext is in milliseconds.
    const limiter = { consume: jest.fn().mockRejectedValue({ msBeforeNext: 5000 }) };
    const middleware = rateLimit(limiter, (retry) => `wait ${retry}`);
    const req = { user: { _id: 'u1' } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith('Retry-After', '5');
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'wait 5s' });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards a real store Error to next() instead of treating it as a 429', async () => {
    const boom = new Error('redis is down');
    const limiter = { consume: jest.fn().mockRejectedValue(boom) };
    const middleware = rateLimit(limiter, () => 'blocked');
    const req = { user: { _id: 'u1' } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes through (no consume) when req.user is not set', async () => {
    const limiter = { consume: jest.fn() };
    const middleware = rateLimit(limiter, () => 'blocked');
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(limiter.consume).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});

describe('submission-specific limiter quotas (in-memory in test env)', () => {
  it('submissionMinuteLimiter allows 2 consumes and rejects the 3rd for the same key', async () => {
    const key = `min-${Math.random()}`;
    await expect(submissionMinuteLimiter.consume(key)).resolves.toBeDefined();
    await expect(submissionMinuteLimiter.consume(key)).resolves.toBeDefined();
    await expect(submissionMinuteLimiter.consume(key)).rejects.toBeDefined();
  });

  it('submissionDailyLimiter allows exactly 20 consumes and rejects the 21st for the same key', async () => {
    const key = `day-${Math.random()}`;
    for (let i = 0; i < 20; i += 1) {
      await expect(submissionDailyLimiter.consume(key)).resolves.toBeDefined();
    }
    await expect(submissionDailyLimiter.consume(key)).rejects.toBeDefined();
  });
});
