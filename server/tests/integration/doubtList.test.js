import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../app.js';
import Doubt from '../../models/Doubt.js';
import Problem from '../../models/Problem.js';
import { registerAs } from '../helpers/users.js';

const app = createApp();
let student, other, teacher;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const BASE = Date.parse('2026-10-01T00:00:00Z');

async function register(role, name = role) {
  const res = await registerAs(app, { name, email: `${name}${Math.random()}@x.com`, password: 'password123', role });
  return { token: res.body.accessToken, id: res.body.user._id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const get = (u, query = '') => request(app).get(`/doubts${query ? `?${query}` : ''}`).set(as(u));
// Raw inserts keep createdAt under test control. `rejectedAt(i)` marks some doubts auto_rejected.
const make = (u, i, over = {}) => ({
  studentId: oid(u.id), title: `Doubt ${i}`, body: `Body of doubt ${i}`, status: 'pending_review', aiDraftStatus: 'success',
  createdAt: new Date(BASE + i * 60000), updatedAt: new Date(BASE + i * 60000), ...over,
});
const seed = (u, n, over = () => ({})) => Doubt.collection.insertMany(Array.from({ length: n }, (_, i) => make(u, i, over(i))));
async function walk(u, query) {
  const pages = [];
  let cursor = '';
  for (let i = 0; i < 60; i += 1) {
    const res = await get(u, `${query}${cursor ? `&cursor=${cursor}` : ''}`);
    expect(res.status).toBe(200);
    pages.push(res.body);
    if (!res.body.hasMore) return pages;
    cursor = res.body.nextCursor;
  }
  throw new Error('did not end');
}

beforeEach(async () => {
  await Doubt.init();
  student = await register('student', 'author');
  other = await register('student', 'other');
  teacher = await register('teacher');
});

describe('the Profile doubts list (mine=1)', () => {
  it('never lists an auto_rejected doubt, with rejected doubts in the middle of more than one page', async () => {
    // 45 doubts; every 4th (and the ones either side of a page boundary) is rejected.
    const rejected = new Set([0, 4, 8, 9, 10, 11, 12, 16, 19, 20, 24, 28, 29, 32, 36, 40, 44]);
    await seed(student, 45, (i) => (rejected.has(i) ? { status: 'auto_rejected', aiDraftStatus: 'irrelevant', triage: { verdict: 'unrelated', confidence: 0.99, reason: 'REJECTED_REASON', source: 'ai' } } : {}));
    const pages = await walk(student, 'mine=1&limit=10');
    const ids = pages.flatMap((p) => p.doubts.map((d) => String(d._id)));
    const visible = (await Doubt.collection.find({ studentId: oid(student.id), status: { $ne: 'auto_rejected' } }).sort({ createdAt: -1, _id: -1 }).toArray()).map((d) => String(d._id));
    expect(visible).toHaveLength(45 - rejected.size);
    expect(ids).toEqual(visible);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pages.map((p) => p.doubts.length)).toEqual([10, 10, 8]);
    expect(JSON.stringify(pages)).not.toContain('REJECTED_REASON');
    for (const page of pages) for (const d of page.doubts) expect(d.status).not.toBe('auto_rejected');
    expect(pages[pages.length - 1]).toMatchObject({ hasMore: false, nextCursor: null });
  });
  it('shows the author a doubt being checked, and shows an appealed doubt as pending_review', async () => {
    await Doubt.collection.insertMany([
      make(student, 3, { status: 'pending_triage' }), make(student, 2, { status: 'appealed', aiDraftStatus: 'skipped', appeal: { requestedAt: new Date() } }), make(student, 1),
    ]);
    const mine = (await get(student, 'mine=1')).body.doubts;
    expect(mine.map((d) => d.status)).toEqual(['pending_triage', 'pending_review', 'pending_review']);
    // Other students never see the doubt that is still being checked.
    expect((await get(other, '')).body.doubts.map((d) => d.title)).toEqual(['Doubt 2', 'Doubt 1']);
  });
  it('returns only the signed-in user\'s doubts, across every page', async () => {
    await seed(student, 15); await seed(other, 15);
    const mine = (await walk(student, 'mine=1&limit=10')).flatMap((p) => p.doubts);
    expect(mine).toHaveLength(15);
    expect(mine.every((d) => String(d.studentId._id) === student.id)).toBe(true);
    expect((await get(teacher, 'mine=1')).body.doubts).toEqual([]);
  });
  it('returns an empty page for a user with no doubts', async () => {
    expect((await get(student, 'mine=1')).body).toEqual({ doubts: [], nextCursor: null, hasMore: false });
  });
  it('is stable with identical createdAt values and is not shifted by new doubts arriving while paging', async () => {
    const same = new Date(BASE);
    await seed(student, 25, () => ({ createdAt: same, updatedAt: same }));
    const first = await get(student, 'mine=1&limit=10');
    await Doubt.collection.insertMany([100, 101, 102].map((i) => make(student, i)));
    const second = await get(student, `mine=1&limit=10&cursor=${first.body.nextCursor}`);
    const a = first.body.doubts.map((d) => String(d._id));
    const b = second.body.doubts.map((d) => String(d._id));
    expect(b.filter((id) => a.includes(id))).toEqual([]);
    const original = (await Doubt.collection.find({ studentId: oid(student.id), createdAt: same }).sort({ createdAt: -1, _id: -1 }).toArray()).map((d) => String(d._id));
    expect([...a, ...b]).toEqual(original.slice(0, 20));
  });
});

describe('paging rules for every doubt list', () => {
  it('defaults to 10, clamps to 50, and applies to the board too', async () => {
    await seed(other, 60);
    expect((await get(student, '')).body.doubts).toHaveLength(10);
    expect((await get(student, 'limit=500')).body.doubts).toHaveLength(50);
    expect((await get(student, 'limit=20')).body.doubts).toHaveLength(20);
    expect((await get(student, 'mine=1')).body.doubts).toHaveLength(0);
  });
  it.each(['0', '-3', 'abc', '2.5', ''])('rejects limit=%j with 400', async (limit) => {
    expect((await get(student, `limit=${limit}`)).status).toBe(400);
  });
  it.each([
    ['text', 'not-a-cursor!!'],
    ['base64 of text', Buffer.from('hello').toString('base64url')],
    ['an id that is not an ObjectId', Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), id: 'abc' })).toString('base64url')],
    ['an invalid date', Buffer.from(JSON.stringify({ createdAt: 'x', id: '507f1f77bcf86cd799439011' })).toString('base64url')],
  ])('answers 400 "Invalid cursor" for %s, on the board and on mine', async (_l, cursor) => {
    for (const query of [`cursor=${cursor}`, `mine=1&cursor=${cursor}`]) {
      const res = await get(student, query);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid cursor');
    }
  });
  it('keeps the status filter working together with paging', async () => {
    await seed(other, 25, (i) => (i % 2 ? { aiDraftStatus: 'failed' } : {}));
    const pages = await walk(student, 'status=awaiting_teacher&limit=5');
    expect(pages.flatMap((p) => p.doubts)).toHaveLength(12);
    expect((await get(student, 'status=bogus')).status).toBe(400);
  });
});

describe('what a row contains', () => {
  it('has a short plain-text preview and no body, code, triage internals or appeal data', async () => {
    const problem = await Problem.create({ title: 'Two sum', topics: ['Arrays'] });
    await Doubt.collection.insertOne(make(student, 1, {
      body: '# Help\n\nMy **loop** is slow.\n```python\nSECRET_CODE = 1\n```\nWhy?', code: 'ALSO_SECRET_CODE', problemId: problem._id,
      triage: { verdict: 'too_vague', confidence: 0.4, reason: 'INTERNAL_REASON', source: 'ai', lowConfidence: true }, aiDraftError: 'INTERNAL_ERROR',
    }));
    const row = (await get(student, 'mine=1')).body.doubts[0];
    expect(row.preview).toBe('Help My loop is slow. Why?');
    expect(row).toMatchObject({ title: 'Doubt 1', status: 'pending_review', hasApprovedAnswer: false, problemId: String(problem._id), problemTitle: 'Two sum' });
    for (const heavy of ['body', 'code', 'triage', 'appeal', 'aiDraftError']) expect(row[heavy]).toBeUndefined();
    const text = JSON.stringify(row);
    for (const secret of ['SECRET_CODE', 'INTERNAL_REASON', 'INTERNAL_ERROR']) expect(text).not.toContain(secret);
  });
  it('caps the preview at 160 characters', async () => {
    await Doubt.collection.insertOne(make(student, 1, { body: 'word '.repeat(500) }));
    const { preview } = (await get(student, 'mine=1')).body.doubts[0];
    expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(preview)].length).toBeLessThanOrEqual(160);
    expect(preview.endsWith('…')).toBe(true);
  });
  it('still returns the full doubt, with its body, from the detail route', async () => {
    const inserted = await Doubt.collection.insertOne(make(student, 1, { body: 'FULL BODY TEXT' }));
    const res = await request(app).get(`/doubts/${inserted.insertedId}`).set(as(student));
    expect(res.body.doubt.body).toBe('FULL BODY TEXT');
  });
  it('shows teachers the marker fields they need and no triage internals', async () => {
    await Doubt.collection.insertOne(make(other, 1, { status: 'appealed', aiDraftStatus: 'skipped', triage: { verdict: 'unrelated', confidence: 0.5, reason: 'INTERNAL_REASON', source: 'ai', lowConfidence: true } }));
    const row = (await get(teacher, '')).body.doubts[0];
    expect(row).toMatchObject({ appealed: true, status: 'appealed', triage: { lowConfidence: true } });
    expect(JSON.stringify(row)).not.toContain('INTERNAL_REASON');
  });
});

describe('the query plan', () => {
  const stages = (plan, out = []) => {
    if (!plan || typeof plan !== 'object') return out;
    if (plan.stage) out.push(plan.stage);
    for (const value of Object.values(plan)) { if (Array.isArray(value)) value.forEach((v) => stages(v, out)); else stages(value, out); }
    return out;
  };
  it('serves the Profile list from the studentId + createdAt index, with no scan and no in-memory sort', async () => {
    const explain = await Doubt.find({ $and: [{ studentId: oid(student.id) }, { $or: [{ status: { $nin: ['auto_rejected', 'pending_triage'] } }, { status: 'pending_triage', studentId: oid(student.id) }] }] })
      .sort({ createdAt: -1, _id: -1 }).limit(11).explain('queryPlanner');
    const used = stages(explain.queryPlanner.winningPlan);
    expect(used).toContain('IXSCAN');
    expect(used).not.toContain('COLLSCAN');
    expect(used).not.toContain('SORT');
  });
});
