import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { consumeDaily } from '../../services/usageCounter.js';
import UsageCounter from '../../models/UsageCounter.js';
import { createApp } from '../../app.js';

const userId = () => new mongoose.Types.ObjectId();
const DAY = Date.parse('2026-10-18T10:00:00Z');

describe('consumeDaily', () => {
  it('allows up to the cap, then blocks without changing anything', async () => {
    await UsageCounter.init();
    const id = userId();
    for (let i = 1; i <= 3; i += 1) expect(await consumeDaily({ userId: id, kind: 'doubt', max: 3, now: DAY })).toMatchObject({ allowed: true, count: i });
    expect(await consumeDaily({ userId: id, kind: 'doubt', max: 3, now: DAY })).toMatchObject({ allowed: false });
    expect((await UsageCounter.findOne({ userId: id })).count).toBe(3);
  });
  it('never exceeds the cap under parallel requests', async () => {
    await UsageCounter.init();
    const id = userId();
    const results = await Promise.all(Array.from({ length: 30 }, () => consumeDaily({ userId: id, kind: 'doubt', max: 10, now: DAY })));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect((await UsageCounter.findOne({ userId: id })).count).toBe(10);
  });
  it('keeps users and kinds separate and resets at the Asia/Kolkata midnight', async () => {
    await UsageCounter.init();
    const a = userId(), b = userId();
    await consumeDaily({ userId: a, kind: 'doubt', max: 1, now: DAY });
    expect((await consumeDaily({ userId: a, kind: 'doubt', max: 1, now: DAY })).allowed).toBe(false);
    expect((await consumeDaily({ userId: b, kind: 'doubt', max: 1, now: DAY })).allowed).toBe(true);
    expect((await consumeDaily({ userId: a, kind: 'other', max: 1, now: DAY })).allowed).toBe(true);
    const beforeMidnight = Date.parse('2026-10-18T18:29:59Z');
    const afterMidnight = Date.parse('2026-10-18T18:30:00Z');
    expect((await consumeDaily({ userId: a, kind: 'doubt', max: 1, now: beforeMidnight })).allowed).toBe(false);
    const next = await consumeDaily({ userId: a, kind: 'doubt', max: 1, now: afterMidnight });
    expect(next.allowed).toBe(true);
    expect(next.resetAt.toISOString()).toBe('2026-10-19T18:30:00.000Z');
  });
});

describe('GET /features', () => {
  it('requires login and reports both flags off by default', async () => {
    const app = createApp();
    expect((await request(app).get('/features')).status).toBe(401);
    const reg = await request(app).post('/auth/register').send({ name: 'S', email: 's@x.com', password: 'password123', accountType: 'student' });
    const res = await request(app).get('/features').set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(res.body).toEqual({ features: { aiTriage: false, hintChat: false } });
  });
});
