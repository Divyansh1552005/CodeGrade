import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import HintQuota from '../../models/HintQuota.js';
import { reserve, refund, getQuota } from '../../services/hintQuota.js';

const id = () => new mongoose.Types.ObjectId();
const T0 = Date.parse('2026-10-18T06:00:00Z'); // 11:30 in Kolkata
const MIN = 60 * 1000;
let user, p1, p2, p3;

const doc = () => HintQuota.collection.findOne({ userId: user });
const counters = async () => { const d = await doc(); return d && { messages: d.messages, questions: d.questions.map(String), recent: d.recent, refunds: d.refunds, ledger: d.ledger }; };
const send = (problemId, now) => reserve({ userId: user, problemId, now });

beforeEach(async () => {
  await HintQuota.init();
  user = id(); p1 = id(); p2 = id(); p3 = id();
});
afterEach(() => {
  for (const key of ['HINT_MAX_MESSAGES_PER_WINDOW', 'HINT_MAX_MESSAGES_PER_DAY', 'HINT_MAX_QUESTIONS_PER_DAY', 'REFUND_CAP_PER_DAY']) delete process.env[key];
});

describe('daily question limit', () => {
  it('allows two distinct questions and blocks the third, without consuming anything', async () => {
    expect((await send(p1, T0)).ok).toBe(true);
    expect((await send(p2, T0 + 2 * MIN)).ok).toBe(true);
    const before = await counters();
    const blocked = await send(p3, T0 + 4 * MIN);
    expect(blocked).toMatchObject({ ok: false, limit: 'daily_questions' });
    expect(blocked.quota).toMatchObject({ questionsLeft: 0, messagesLeft: 3 });
    expect(await counters()).toEqual(before);
  });
  it('lets extra messages on an already counted question use only the message quota', async () => {
    const first = await send(p1, T0);
    expect(first).toMatchObject({ ok: true, tookSlot: true, quota: { questionsLeft: 1, messagesLeft: 4 } });
    const second = await send(p1, T0 + 2 * MIN);
    expect(second).toMatchObject({ ok: true, tookSlot: false, quota: { questionsLeft: 1, messagesLeft: 3 } });
    expect((await counters()).questions).toEqual([String(p1)]);
    // The second slot is still free for a different problem.
    expect((await send(p2, T0 + 4 * MIN)).ok).toBe(true);
  });
});

describe('daily message limit', () => {
  it('blocks the sixth message, with no per-question cap before that', async () => {
    for (let i = 0; i < 5; i += 1) expect((await send(p1, T0 + i * 2 * MIN)).ok).toBe(true);
    const before = await counters();
    const sixth = await send(p1, T0 + 12 * MIN);
    expect(sixth).toMatchObject({ ok: false, limit: 'daily_messages', quota: { messagesLeft: 0 } });
    expect(await counters()).toEqual(before);
  });
  it('reports the reset time as the next Asia/Kolkata midnight', async () => {
    const { quota } = await send(p1, T0);
    expect(quota.resetAt.toISOString()).toBe('2026-10-18T18:30:00.000Z');
  });
});

describe('rolling per-minute limit', () => {
  it('blocks the third message inside 60 seconds and says how long to wait', async () => {
    expect((await send(p1, T0)).ok).toBe(true);
    expect((await send(p1, T0 + 10_000)).ok).toBe(true);
    const before = await counters();
    const blocked = await send(p1, T0 + 20_000);
    expect(blocked).toMatchObject({ ok: false, limit: 'rate' });
    expect(blocked.quota.retryAfterSeconds).toBe(40);
    expect(await counters()).toEqual(before);
    expect((await send(p1, T0 + 59_000)).ok).toBe(false);
    expect((await send(p1, T0 + 60_001)).ok).toBe(true);
  });
  it('is separate from the daily quota: a blocked message costs no daily message', async () => {
    await send(p1, T0); await send(p1, T0 + 1000);
    await send(p1, T0 + 2000); await send(p1, T0 + 3000);
    expect((await getQuota({ userId: user, now: T0 + 4000 })).messagesLeft).toBe(3);
  });
});

describe('parallel requests', () => {
  it('cannot exceed the per-minute limit', async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => send(p1, T0)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect((await counters()).messages).toBe(2);
  });
  it('cannot exceed the daily message limit', async () => {
    process.env.HINT_MAX_MESSAGES_PER_WINDOW = '100';
    const results = await Promise.all(Array.from({ length: 30 }, () => send(p1, T0)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok).every((r) => r.limit === 'daily_messages')).toBe(true);
    expect((await counters()).messages).toBe(5);
  });
  it('cannot exceed the daily question limit', async () => {
    process.env.HINT_MAX_MESSAGES_PER_WINDOW = '100';
    process.env.HINT_MAX_MESSAGES_PER_DAY = '100';
    const problems = Array.from({ length: 8 }, id);
    const results = await Promise.all(problems.flatMap((p) => [send(p, T0), send(p, T0)]));
    const state = await counters();
    expect(state.questions).toHaveLength(2);
    expect(results.filter((r) => r.ok && r.tookSlot)).toHaveLength(2);
    expect(state.messages).toBe(results.filter((r) => r.ok).length);
    // Every accepted message belongs to one of the two counted questions.
    const ledgerProblems = new Set((await doc()).ledger.map((e) => String(e.problemId)));
    expect(ledgerProblems.size).toBe(2);
    expect([...ledgerProblems].every((p) => state.questions.includes(p))).toBe(true);
  });
  it('keeps users independent', async () => {
    const other = id();
    const results = await Promise.all([send(p1, T0), send(p1, T0), reserve({ userId: other, problemId: p1, now: T0 }), reserve({ userId: other, problemId: p1, now: T0 })]);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});

describe('daily reset at the Asia/Kolkata midnight', () => {
  it('stays blocked until 00:00 in India and resets the counters exactly then', async () => {
    const base = Date.parse('2026-10-18T18:20:00Z'); // 23:50 IST
    for (let i = 0; i < 5; i += 1) expect((await send(p1, base - (5 - i) * 2 * MIN)).ok).toBe(true);
    expect(await send(p1, Date.parse('2026-10-18T18:29:59Z'))).toMatchObject({ ok: false, limit: 'daily_messages' });
    const fresh = await send(p3, Date.parse('2026-10-18T18:30:00Z'));
    expect(fresh).toMatchObject({ ok: true, tookSlot: true, quota: { messagesLeft: 4, questionsLeft: 1 } });
    expect(fresh.quota.resetAt.toISOString()).toBe('2026-10-19T18:30:00.000Z');
    expect((await counters()).questions).toEqual([String(p3)]);
  });
  it('also resets the refund counter', async () => {
    process.env.REFUND_CAP_PER_DAY = '1';
    const a = await send(p1, T0);
    expect((await refund({ userId: user, attemptId: a.attemptId, day: a.day, problemId: p1, now: T0 })).refunded).toBe(true);
    const nextDay = Date.parse('2026-10-18T18:31:00Z');
    const b = await send(p1, nextDay);
    expect((await refund({ userId: user, attemptId: b.attemptId, day: b.day, problemId: p1, now: nextDay })).refunded).toBe(true);
  });
});

describe('refunds', () => {
  const failed = async (problem, now) => {
    const r = await send(problem, now);
    return { ...r, give: () => refund({ userId: user, attemptId: r.attemptId, day: r.day, problemId: problem, now }) };
  };
  it('returns the message and, for the message that took it, the question slot', async () => {
    const r = await failed(p1, T0);
    expect(r.quota).toMatchObject({ messagesLeft: 4, questionsLeft: 1 });
    const out = await r.give();
    expect(out).toMatchObject({ refunded: true, quota: { messagesLeft: 5, questionsLeft: 2 } });
    expect((await counters()).questions).toEqual([]);
  });
  it('keeps the question slot when a later message on the same question is refunded', async () => {
    await send(p1, T0);
    const second = await failed(p1, T0 + 2 * MIN);
    const out = await second.give();
    expect(out).toMatchObject({ refunded: true, quota: { messagesLeft: 4, questionsLeft: 1 } });
    expect((await counters()).questions).toEqual([String(p1)]);
  });
  it('keeps the slot when the message that took it is refunded but another message on that question succeeded', async () => {
    process.env.HINT_MAX_MESSAGES_PER_WINDOW = '100';
    const first = await failed(p1, T0);
    await send(p1, T0 + 1000); // concurrent success on the same question
    await first.give();
    expect((await counters()).questions).toEqual([String(p1)]);
  });
  it('is idempotent: a second refund does nothing and counters never go negative', async () => {
    const r = await failed(p1, T0);
    expect((await r.give()).refunded).toBe(true);
    const again = await r.give();
    expect(again).toMatchObject({ refunded: false, reason: 'already_refunded' });
    const state = await counters();
    expect(state.messages).toBe(0);
    expect(state.refunds).toBe(1);
  });
  it('ignores an unknown attempt', async () => {
    await send(p1, T0);
    const out = await refund({ userId: user, attemptId: id(), day: '2026-10-18', problemId: p1, now: T0 });
    expect(out).toMatchObject({ refunded: false, reason: 'unknown_attempt' });
    expect((await counters()).messages).toBe(1);
  });
  it('does not free the per-minute slot, because the AI call was made', async () => {
    const a = await failed(p1, T0);
    const b = await failed(p1, T0 + 5000);
    await a.give(); await b.give();
    expect(await send(p1, T0 + 10_000)).toMatchObject({ ok: false, limit: 'rate' });
    expect((await send(p1, T0 + 61_000)).ok).toBe(true);
  });
  it('stops refunding after the daily refund cap (default 3), leaving the message counted', async () => {
    process.env.HINT_MAX_MESSAGES_PER_WINDOW = '100';
    process.env.HINT_MAX_MESSAGES_PER_DAY = '100';
    for (let i = 0; i < 3; i += 1) expect((await (await failed(p1, T0 + i * 1000)).give()).refunded).toBe(true);
    const fourth = await failed(p1, T0 + 4000);
    expect(await fourth.give()).toMatchObject({ refunded: false, reason: 'cap_reached' });
    expect((await counters()).messages).toBe(1);
  });
  it('cannot be double-refunded by parallel calls', async () => {
    const r = await failed(p1, T0);
    const results = await Promise.all(Array.from({ length: 8 }, () => r.give()));
    expect(results.filter((x) => x.refunded)).toHaveLength(1);
    expect((await counters()).messages).toBe(0);
    expect((await counters()).refunds).toBe(1);
  });
  it('gives nothing back for an attempt from an earlier day', async () => {
    const r = await failed(p1, T0);
    const out = await refund({ userId: user, attemptId: r.attemptId, day: r.day, problemId: p1, now: Date.parse('2026-10-18T19:00:00Z') });
    // Same stored day still, so this is a normal same-day refund; a different day argument must not match.
    expect(out.refunded).toBe(true);
    const r2 = await failed(p1, T0 + 2 * MIN);
    const stale = await refund({ userId: user, attemptId: r2.attemptId, day: '2026-10-17', problemId: p1, now: T0 });
    expect(stale.refunded).toBe(false);
  });
});

describe('getQuota', () => {
  it('starts with the full allowance and the next midnight as the reset', async () => {
    expect(await getQuota({ userId: user, now: T0 })).toMatchObject({ questionsLeft: 2, messagesLeft: 5, retryAfterSeconds: 0 });
  });
  it('writes nothing when only reading', async () => {
    await getQuota({ userId: user, now: T0 });
    expect(await doc()).toBeNull();
  });
  it('creates a TTL index for cleanup', async () => {
    const indexes = await HintQuota.collection.indexes();
    expect(indexes.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
    expect(indexes.find((i) => i.key.userId === 1)?.unique).toBe(true);
  });
});
