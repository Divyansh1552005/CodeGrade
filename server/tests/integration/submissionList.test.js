import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../app.js';
import Submission from '../../models/Submission.js';
import Problem from '../../models/Problem.js';
import StudentStats from '../../models/StudentStats.js';
import { rebuildStudentStats } from '../../services/progressService.js';

const app = createApp();
let student, other, teacher, problems;
const oid = (v) => new mongoose.Types.ObjectId(String(v));

async function register(role, name = role) {
  const res = await request(app).post('/auth/register').send({ name, email: `${name}${Math.random()}@x.com`, password: 'password123', role });
  return { token: res.body.accessToken, id: res.body.user._id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const BASE = Date.parse('2026-10-01T00:00:00Z');

// Raw inserts so createdAt is under test control and the heavy fields really exist.
const row = (u, i, over = {}) => ({
  studentId: oid(u.id), problemId: oid(problems[i % problems.length].id), code: 'SECRET_SOURCE_CODE', language: 'python',
  status: 'graded', passCount: i % 4, totalCount: 3, feedbackStatus: 'completed',
  testResults: [{ input: 'HIDDEN_INPUT', expectedOutput: 'HIDDEN_OUTPUT', actualOutput: 'x', passed: false }],
  aiFeedback: { summary: 'SECRET_FEEDBACK', strengths: [], improvements: [], complexityNote: '' },
  testCasesSnapshot: [{ input: 'SNAPSHOT_INPUT', expectedOutput: 'SNAPSHOT_OUTPUT' }],
  createdAt: new Date(BASE + i * 60000), updatedAt: new Date(BASE + i * 60000), ...over,
});
const seed = (u, n, over = {}) => Submission.collection.insertMany(Array.from({ length: n }, (_, i) => row(u, i, typeof over === 'function' ? over(i) : over)));
const get = (u, query = '') => request(app).get(`/submissions${query ? `?${query}` : ''}`).set(as(u));
async function walk(u, query = '') {
  const pages = [];
  let cursor = '';
  for (let i = 0; i < 50; i += 1) {
    const res = await get(u, `${query}${query && cursor ? '&' : ''}${cursor ? `cursor=${cursor}` : ''}`);
    expect(res.status).toBe(200);
    pages.push(res.body);
    if (!res.body.hasMore) return pages;
    cursor = res.body.nextCursor;
  }
  throw new Error('did not end');
}

beforeEach(async () => {
  await Submission.init();
  student = await register('student', 'author');
  other = await register('student', 'other');
  teacher = await register('teacher');
  problems = await Problem.insertMany([{ title: 'Two sum', topics: ['Arrays'] }, { title: 'Anagrams', topics: ['Strings'] }, { title: 'Palindrome', topics: ['Strings'] }]);
});

describe('paging', () => {
  it('returns the first page newest first, with a cursor, and light rows', async () => {
    await seed(student, 25);
    const res = await get(student);
    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(10);
    expect(res.body).toMatchObject({ hasMore: true });
    expect(res.body.nextCursor).toEqual(expect.any(String));
    const times = res.body.submissions.map((s) => Date.parse(s.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(res.body.submissions[0]).toMatchObject({ language: 'python', status: 'graded', totalCount: 3, feedbackStatus: 'completed' });
    expect(res.body.submissions[0].problemTitle).toEqual(expect.any(String));
    expect(res.body.submissions[0].problemId).toMatch(/^[0-9a-f]{24}$/);
  });
  it('walks first, middle and last pages with no gaps or repeats, and the last page has no cursor', async () => {
    await seed(student, 25);
    const pages = await walk(student);
    expect(pages.map((p) => p.submissions.length)).toEqual([10, 10, 5]);
    expect(pages[1].hasMore).toBe(true);
    expect(pages[2]).toMatchObject({ hasMore: false, nextCursor: null });
    const all = pages.flatMap((p) => p.submissions.map((s) => String(s._id)));
    expect(new Set(all).size).toBe(25);
    const everything = await Submission.collection.find({ studentId: oid(student.id) }).sort({ createdAt: -1, _id: -1 }).toArray();
    expect(all).toEqual(everything.map((s) => String(s._id)));
  });
  it('returns an empty list for a user with no submissions', async () => {
    expect((await get(student)).body).toEqual({ submissions: [], nextCursor: null, hasMore: false });
  });
  it('defaults to 10 and clamps the limit to 50', async () => {
    await seed(student, 60);
    expect((await get(student)).body.submissions).toHaveLength(10);
    expect((await get(student, 'limit=500')).body.submissions).toHaveLength(50);
    expect((await get(student, 'limit=3')).body.submissions).toHaveLength(3);
    expect((await get(student, 'limit=50')).body.submissions).toHaveLength(50);
  });
  it.each(['0', '-1', 'abc', '1.5', ''])('rejects limit=%j with 400', async (limit) => {
    expect((await get(student, `limit=${limit}`)).status).toBe(400);
  });
  it.each([
    ['text that is not base64 JSON', 'not-a-cursor!!'],
    ['base64 of text', Buffer.from('hello').toString('base64url')],
    ['JSON without an id', Buffer.from(JSON.stringify({ createdAt: new Date().toISOString() })).toString('base64url')],
    ['an id that is not an ObjectId', Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), id: 'abc' })).toString('base64url')],
    ['an invalid date', Buffer.from(JSON.stringify({ createdAt: 'yesterday', id: '507f1f77bcf86cd799439011' })).toString('base64url')],
    ['a JSON array', Buffer.from('[1,2]').toString('base64url')],
  ])('rejects %s as a cursor with 400', async (_l, cursor) => {
    const res = await get(student, `cursor=${cursor}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid cursor');
  });
  it('orders rows with identical createdAt by _id, with no repeats or gaps across pages', async () => {
    const same = new Date(BASE);
    await seed(student, 25, { createdAt: same, updatedAt: same });
    const pages = await walk(student, 'limit=7');
    const all = pages.flatMap((p) => p.submissions.map((s) => String(s._id)));
    expect(all).toHaveLength(25);
    expect(new Set(all).size).toBe(25);
    expect(all).toEqual([...all].sort().reverse());
  });
  it('is not shifted or repeated by new submissions arriving while paging', async () => {
    await seed(student, 25);
    const first = await get(student, 'limit=10');
    const firstIds = first.body.submissions.map((s) => String(s._id));
    // Three newer submissions arrive after the student loaded page one.
    await Submission.collection.insertMany([100, 101, 102].map((i) => row(student, i)));
    const second = await get(student, `limit=10&cursor=${first.body.nextCursor}`);
    const secondIds = second.body.submissions.map((s) => String(s._id));
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
    const original = (await Submission.collection.find({ studentId: oid(student.id), createdAt: { $lt: new Date(BASE + 100 * 60000) } }).sort({ createdAt: -1, _id: -1 }).toArray()).map((s) => String(s._id));
    expect([...firstIds, ...secondIds]).toEqual(original.slice(0, 20));
  });
  it('filters by problem and returns the cheap total for that student and problem only', async () => {
    await seed(student, 12);
    await seed(other, 7);
    const wanted = String(problems[0].id);
    const res = await get(student, `problemId=${wanted}&limit=3`);
    expect(res.body.submissions.every((s) => s.problemId === wanted)).toBe(true);
    expect(res.body.total).toBe(4);
    expect(res.body.submissions).toHaveLength(3);
    expect((await get(student)).body.total).toBeUndefined();
    expect((await get(student, 'problemId=nope')).status).toBe(400);
  });
});

describe('what a row contains', () => {
  it('never includes code, test results, AI feedback, the grading snapshot or other users\' fields', async () => {
    await seed(student, 3);
    const body = JSON.stringify((await get(student)).body);
    for (const heavy of ['SECRET_SOURCE_CODE', 'HIDDEN_INPUT', 'HIDDEN_OUTPUT', 'SECRET_FEEDBACK', 'SNAPSHOT_INPUT']) expect(body).not.toContain(heavy);
    const keys = Object.keys((await get(student)).body.submissions[0]).sort();
    expect(keys).toEqual(['_id', 'createdAt', 'feedbackStatus', 'language', 'passCount', 'problemId', 'problemTitle', 'status', 'totalCount']);
  });
  it('still returns the full record, with code and results, from the detail route', async () => {
    await seed(student, 1);
    const id = (await Submission.collection.findOne({ studentId: oid(student.id) }))._id;
    const res = await request(app).get(`/submissions/${id}`).set(as(student));
    expect(res.status).toBe(200);
    expect(res.body.submission.code).toBe('SECRET_SOURCE_CODE');
    expect(res.body.submission.testResults).toHaveLength(1);
  });
});

describe('authorization', () => {
  it('requires login', async () => {
    expect((await request(app).get('/submissions')).status).toBe(401);
  });
  it('gives a student only their own submissions, across every page', async () => {
    await seed(student, 15); await seed(other, 15);
    const all = (await walk(student)).flatMap((p) => p.submissions.map((s) => String(s._id)));
    const mine = (await Submission.collection.find({ studentId: oid(student.id) }).toArray()).map((s) => String(s._id));
    expect(all.sort()).toEqual(mine.sort());
    expect((await get(student, 'studentId=' + other.id)).body.submissions.every((s) => s.studentId === undefined)).toBe(true);
    const asOther = (await get(other)).body.submissions.map((s) => String(s._id));
    expect(asOther.some((id) => mine.includes(id))).toBe(false);
  });
  it('lets a teacher list everyone\'s submissions, bounded by the same limit, with the student id', async () => {
    await seed(student, 30); await seed(other, 30);
    const res = await get(teacher);
    expect(res.body.submissions).toHaveLength(10);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.submissions[0].studentId).toBeTruthy();
    expect((await get(teacher, 'limit=500')).body.submissions).toHaveLength(50);
    expect(res.body.total).toBeUndefined();
    const owners = new Set((await walk(teacher, 'limit=50')).flatMap((p) => p.submissions.map((s) => String(s.studentId))));
    expect(owners).toEqual(new Set([student.id, other.id]));
  });
});

describe('indexes and query plans', () => {
  const stages = (plan, out = []) => {
    if (!plan || typeof plan !== 'object') return out;
    if (plan.stage) out.push(plan.stage);
    for (const value of Object.values(plan)) { if (Array.isArray(value)) value.forEach((v) => stages(v, out)); else stages(value, out); }
    return out;
  };
  const plan = async (filter) => stages((await Submission.find(filter).sort({ createdAt: -1, _id: -1 }).limit(11).explain('queryPlanner')).queryPlanner.winningPlan);
  it('builds the paging indexes and keeps the old studentId + problemId index', async () => {
    const keys = (await Submission.collection.indexes()).map((i) => JSON.stringify(i.key));
    for (const key of [
      { studentId: 1, problemId: 1 }, { studentId: 1, createdAt: -1, _id: -1 }, { studentId: 1, problemId: 1, createdAt: -1, _id: -1 },
      { createdAt: -1, _id: -1 }, { problemId: 1, createdAt: -1, _id: -1 },
    ]) expect(keys).toContain(JSON.stringify(key));
    await Submission.init();
    await Submission.init(); // safe to run again
    expect((await Submission.collection.indexes()).length).toBe(keys.length);
  });
  it.each([
    ['a student\'s list', () => ({ studentId: oid(student.id) })],
    ['a student\'s list for one problem', () => ({ studentId: oid(student.id), problemId: oid(problems[0].id) })],
    ['the teacher list of all submissions', () => ({})],
    ['the teacher list for one problem', () => ({ problemId: oid(problems[0].id) })],
  ])('serves %s from an index with no collection scan and no in-memory sort', async (_label, filter) => {
    const used = await plan(filter());
    expect(used).toContain('IXSCAN');
    expect(used).not.toContain('COLLSCAN');
    expect(used).not.toContain('SORT');
  });
});

describe('numbers that are not computed from a page', () => {
  it('keeps solved and submission counts correct for a user with more submissions than one page', async () => {
    // 25 graded submissions: problems 0 and 1 are solved at least once, problem 2 never is.
    await seed(student, 25, (i) => ({ passCount: [0, 1].includes(i % 3) && i % 5 === 0 ? 3 : 1, totalCount: 3, problemId: oid(problems[i % 3].id) }));
    const solved = new Set((await Submission.collection.find({ studentId: oid(student.id), passCount: 3, totalCount: 3 }).toArray()).map((s) => String(s.problemId)));
    await rebuildStudentStats(student.id);
    const progress = (await request(app).get('/activity/progress').set(as(student))).body.progress;
    expect(progress.submissionCount).toBe(25);
    expect(progress.passedTests).toBe((await Submission.collection.find({ studentId: oid(student.id) }).toArray()).reduce((sum, r) => sum + r.passCount, 0));
    expect((await StudentStats.findOne({ studentId: student.id })).solvedCount).toBe(solved.size);
    // The paged list covers the same 25 rows, however they are split into pages.
    const pages = await walk(student, 'limit=10');
    expect(pages.flatMap((p) => p.submissions)).toHaveLength(25);
    expect((await StudentStats.findOne({ studentId: student.id })).submissionCount).toBe(25);
  });
});
