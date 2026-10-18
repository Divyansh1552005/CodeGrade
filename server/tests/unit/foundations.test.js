import { describe, it, expect, jest, afterEach } from '@jest/globals';
import request from 'supertest';
import { dayKey, nextResetAt, DAY_TIMEZONE } from '../../utils/istDay.js';
import { redact, createLogger } from '../../utils/logger.js';
import { aiLimits } from '../../config/aiLimits.js';
import { withAiSlot, AiBusyError, __activeForTest } from '../../services/aiGate.js';
import { createApp } from '../../app.js';

afterEach(() => {
  delete process.env.AI_MAX_CONCURRENT_CALLS;
  delete process.env.AI_QUEUE_WAIT_MS;
  delete process.env.HINT_MAX_MESSAGES_PER_DAY;
  delete process.env.LOG_LEVEL;
});

describe('Asia/Kolkata day boundary', () => {
  it('uses the Asia/Kolkata timezone constant', () => {
    expect(DAY_TIMEZONE).toBe('Asia/Kolkata');
  });
  it('rolls the day at 18:30 UTC, which is midnight in India', () => {
    expect(dayKey(Date.parse('2026-10-18T18:29:59.999Z'))).toBe('2026-10-18');
    expect(dayKey(Date.parse('2026-10-18T18:30:00.000Z'))).toBe('2026-10-19');
  });
  it('reports the next midnight as the reset time', () => {
    expect(nextResetAt(Date.parse('2026-10-18T10:00:00Z')).toISOString()).toBe('2026-10-18T18:30:00.000Z');
    // Exactly at midnight, the next reset is a full day away.
    expect(nextResetAt(Date.parse('2026-10-18T18:30:00Z')).toISOString()).toBe('2026-10-19T18:30:00.000Z');
  });
  it('handles year ends', () => {
    expect(dayKey(Date.parse('2026-12-31T18:30:00Z'))).toBe('2027-01-01');
  });
});

describe('logger redaction', () => {
  it('replaces code, chat and doubt text with their length', () => {
    const out = redact({ userId: 'u1', code: 'print(1)', message: 'give me the answer', body: 'x'.repeat(50), nested: { reply: 'secret text' } });
    expect(out.userId).toBe('u1');
    expect(out.code).toBe('[redacted length=8]');
    expect(out.message).toBe('[redacted length=18]');
    expect(out.body).toBe('[redacted length=50]');
    expect(out.nested.reply).toBe('[redacted length=11]');
  });
  it('truncates long free-form strings under other keys', () => {
    expect(redact({ note: 'a'.repeat(500) }).note).toBe('[truncated length=500]');
  });
  it('never writes the sensitive text to stdout', () => {
    process.env.LOG_LEVEL = 'info';
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    createLogger({ requestId: 'req-1' }).info('hint.reply', { code: 'SECRET_CODE', length: 11 });
    const line = write.mock.calls.map((c) => c[0]).join('');
    write.mockRestore();
    expect(line).toContain('"requestId":"req-1"');
    expect(line).not.toContain('SECRET_CODE');
  });
});

describe('request id middleware', () => {
  const app = createApp();
  it('generates an id and returns it in X-Request-Id', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('keeps a well-formed incoming id and replaces a malformed one', async () => {
    expect((await request(app).get('/health').set('X-Request-Id', 'abc12345-trace')).headers['x-request-id']).toBe('abc12345-trace');
    expect((await request(app).get('/health').set('X-Request-Id', 'bad id\twith spaces')).headers['x-request-id']).not.toContain('bad');
  });
});

describe('feature flags and limits', () => {
  it('exposes the spec defaults and honours env overrides', () => {
    const { hints, triage } = aiLimits();
    expect([hints.maxMessagesPerDay, hints.maxMessagesPerWindow, hints.windowSeconds]).toEqual([10, 2, 60]);
    expect(hints.maxQuestionsPerDay).toBeUndefined();
    expect([hints.maxCodeLines, hints.refundCapPerDay, triage.rejectThreshold, triage.maxDoubtsPerDay, triage.stuckMinutes]).toEqual([8, 3, 0.85, 10, 5]);
    process.env.HINT_MAX_MESSAGES_PER_DAY = '9';
    expect(aiLimits().hints.maxMessagesPerDay).toBe(9);
    process.env.HINT_MAX_MESSAGES_PER_DAY = 'not a number';
    expect(aiLimits().hints.maxMessagesPerDay).toBe(10);
  });
});

describe('AI concurrency gate', () => {
  it('runs at most the configured number of calls at once and queues the rest', async () => {
    process.env.AI_MAX_CONCURRENT_CALLS = '2';
    let running = 0, peak = 0;
    const task = () => withAiSlot(async () => {
      running += 1; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
      return 'ok';
    });
    const results = await Promise.all(Array.from({ length: 6 }, task));
    expect(results).toEqual(Array(6).fill('ok'));
    expect(peak).toBe(2);
    expect(__activeForTest()).toEqual({ active: 0, waiting: 0 });
  });
  it('fails with a 503 AiBusyError when no slot frees up in time, and releases on errors', async () => {
    process.env.AI_MAX_CONCURRENT_CALLS = '1';
    process.env.AI_QUEUE_WAIT_MS = '30';
    const slow = withAiSlot(() => new Promise((r) => setTimeout(() => r('done'), 120)));
    await expect(withAiSlot(async () => 'never')).rejects.toMatchObject({ name: 'AiBusyError', status: 503 });
    expect(new AiBusyError().status).toBe(503);
    await slow;
    await expect(withAiSlot(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(__activeForTest()).toEqual({ active: 0, waiting: 0 });
  });
});
