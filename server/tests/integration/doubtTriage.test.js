import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { registerAs } from '../helpers/users.js';

const svc = (p) => new URL(`../../services/${p}`, import.meta.url).pathname;
const classify = jest.fn();
jest.unstable_mockModule(svc('doubtTriageChain.js'), () => ({ classifyDoubt: classify }));

const { createApp } = await import('../../app.js');
const Doubt = (await import('../../models/Doubt.js')).default;
const Problem = (await import('../../models/Problem.js')).default;
const WorkItem = (await import('../../models/WorkItem.js')).default;
const Notification = (await import('../../models/Notification.js')).default;
const { processWork, failWork } = await import('../../services/workProcessor.js');
const { recoverDomainWork } = await import('../../services/recoveryService.js');
const { QUEUE_NAMES } = await import('../../services/queueRuntime.js');
const { WORK_TYPES } = await import('../../models/WorkItem.js');

const app = createApp();
let student, other, teacher;

async function register(role, name = role) {
  const res = await registerAs(app, { name, email: `${name}${Math.random()}@x.com`, password: 'password123', role });
  return { token: res.body.accessToken, id: res.body.user._id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const post = (u, extra = {}) => request(app).post('/doubts').set(as(u)).send({ title: 'Why is my loop slow?', body: 'It is O(n^2), how do I fix it?', ...extra });
const work = (key) => WorkItem.findOne({ key });
const run = async (key, attemptsMade = 0) => processWork({ data: { workItemId: (await work(key)).id }, attemptsMade, opts: { attempts: 3 } });
const verdict = (v, c, reason = 'Because of the content.') => classify.mockResolvedValue({ result: { verdict: v, confidence: c, reason } });

beforeEach(async () => {
  classify.mockReset();
  student = await register('student', 'author');
  other = await register('student', 'other');
  teacher = await register('teacher');
});
afterEach(() => { delete process.env.MAX_DOUBTS_PER_DAY; jest.restoreAllMocks(); });

describe('creating a doubt', () => {
  it('saves it as pending_triage, queues triage only, and returns immediately without calling the AI', async () => {
    const res = await post(student);
    expect(res.status).toBe(201);
    expect(res.body.doubt.status).toBe('pending_triage');
    expect(classify).not.toHaveBeenCalled();
    const triageWork = await work(`triage-${res.body.doubt._id}`);
    expect(triageWork).toMatchObject({ type: 'doubt-triage', status: 'pending' });
    expect(triageWork.payload.requestId).toBeTruthy();
    expect(await work(`draft-${res.body.doubt._id}`)).toBeNull();
  });
  it('shows the doubt only to its author while it is being checked', async () => {
    const id = (await post(student)).body.doubt._id;
    const board = async (u) => (await request(app).get('/doubts').set(as(u))).body.doubts.map((d) => d._id);
    expect(await board(student)).toContain(id);
    expect(await board(other)).not.toContain(id);
    expect(await board(teacher)).not.toContain(id);
  });
  it('registers the triage queue and work type', () => {
    expect(QUEUE_NAMES['doubt-triage']).toBe('doubt-triage');
    expect(WORK_TYPES).toContain('doubt-triage');
  });
});

describe('triage decisions', () => {
  it('removes a confidently unrelated doubt, tells the student why, and never queues a draft', async () => {
    const id = (await post(student)).body.doubt._id;
    verdict('unrelated', 0.95, 'This is about cooking, not programming.');
    await run(`triage-${id}`);
    const doubt = await Doubt.findById(id).setOptions({ includeRemoved: true });
    expect(doubt.status).toBe('auto_rejected');
    expect(doubt.triage).toMatchObject({ verdict: 'unrelated', confidence: 0.95, reason: 'This is about cooking, not programming.', source: 'ai' });
    expect(doubt.triage.model).toMatch(/:/);
    expect(doubt.triage.decidedAt).toBeInstanceOf(Date);
    expect(await work(`draft-${id}`)).toBeNull();
    const notes = await Notification.find({ userId: student.id });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: 'doubt_removed', title: 'Your doubt was marked off topic', body: 'This is about cooking, not programming.', href: `/doubts/${id}/removed` });
    expect((await request(app).get('/doubts').set(as(student))).body.doubts).toHaveLength(0);
    expect((await request(app).get(`/doubts/${id}`).set(as(teacher))).status).toBe(404);
  });
  it('removes confident spam, described as removed rather than off topic', async () => {
    const id = (await post(student)).body.doubt._id;
    verdict('spam_or_abusive', 0.9);
    await run(`triage-${id}`);
    expect((await Doubt.findById(id).setOptions({ includeRemoved: true })).status).toBe('auto_rejected');
    expect((await Notification.findOne({ userId: student.id })).title).toBe('Your doubt was removed');
  });
  it('sends a borderline removal verdict to the teachers, flagged low confidence, and queues the draft', async () => {
    const id = (await post(student)).body.doubt._id;
    verdict('unrelated', 0.7);
    await run(`triage-${id}`);
    const doubt = await Doubt.findById(id);
    expect(doubt.status).toBe('pending_review');
    expect(doubt.triage.lowConfidence).toBe(true);
    expect(await work(`draft-${id}`)).toMatchObject({ type: 'doubt-draft' });
    expect(await Notification.countDocuments()).toBe(0);
    expect((await request(app).get('/doubts').set(as(teacher))).body.doubts.map((d) => d._id)).toContain(id);
  });
  it.each([['relevant', 0.95], ['too_vague', 0.99]])('passes a %s doubt to the teachers', async (v, c) => {
    const id = (await post(student)).body.doubt._id;
    verdict(v, c);
    await run(`triage-${id}`);
    expect((await Doubt.findById(id)).status).toBe('pending_review');
    expect(await work(`draft-${id}`)).not.toBeNull();
  });
  it.each([
    ['the AI is down', () => classify.mockResolvedValue({ error: 'ai_error' }), 'ai_error'],
    ['the AI times out', () => classify.mockResolvedValue({ error: 'timeout' }), 'timeout'],
    ['the output is invalid', () => classify.mockResolvedValue({ error: 'invalid_output' }), 'invalid_output'],
    ['the chain throws', () => classify.mockRejectedValue(new Error('boom')), 'ai_error'],
  ])('fails open when %s, without retrying', async (_label, setup, error) => {
    const id = (await post(student)).body.doubt._id;
    setup();
    await expect(run(`triage-${id}`)).resolves.toBeDefined(); // does not throw, so BullMQ never retries
    const doubt = await Doubt.findById(id);
    expect(doubt.status).toBe('pending_review');
    expect(doubt.triage).toMatchObject({ source: 'fallback', error, lowConfidence: true });
    expect(await work(`draft-${id}`)).not.toBeNull();
    expect((await work(`triage-${id}`)).status).toBe('completed');
    expect(classify).toHaveBeenCalledTimes(1);
  });
  it('gives the classifier the linked problem and the code snippet, nothing else', async () => {
    const problem = await Problem.create({ title: 'Two sum', description: 'Find two numbers.', topics: ['Arrays'], testCases: [{ input: 'HIDDEN', expectedOutput: 'HIDDEN' }] });
    const id = (await post(student, { problemId: problem.id, code: 'print(1)' })).body.doubt._id;
    verdict('relevant', 0.9);
    await run(`triage-${id}`);
    const arg = classify.mock.calls[0][0];
    expect(arg).toMatchObject({ title: 'Why is my loop slow?', code: 'print(1)' });
    expect(arg.problem).toMatchObject({ title: 'Two sum', topics: ['Arrays'] });
    expect(JSON.stringify(arg)).not.toContain('HIDDEN');
  });
  it('is idempotent: running twice decides once, notifies once and queues one draft', async () => {
    const id = (await post(student)).body.doubt._id;
    verdict('unrelated', 0.95);
    await run(`triage-${id}`);
    await processWork({ data: { workItemId: (await work(`triage-${id}`)).id }, attemptsMade: 0, opts: { attempts: 3 } });
    expect(classify).toHaveBeenCalledTimes(1);
    expect(await Notification.countDocuments()).toBe(1);
    const id2 = (await post(student)).body.doubt._id;
    verdict('relevant', 0.9);
    await run(`triage-${id2}`);
    await processWork({ data: { workItemId: (await work(`triage-${id2}`)).id }, attemptsMade: 0, opts: { attempts: 3 } });
    expect(await WorkItem.countDocuments({ key: `draft-${id2}` })).toBe(1);
  });
  it('retries database errors but not AI errors, and fails open when the retries run out', async () => {
    const id = (await post(student)).body.doubt._id;
    verdict('relevant', 0.9);
    jest.spyOn(Doubt, 'findOneAndUpdate').mockRejectedValueOnce(new Error('db down'));
    await expect(run(`triage-${id}`, 0)).rejects.toThrow('db down');
    expect((await Doubt.findById(id)).status).toBe('pending_triage');
    expect((await work(`triage-${id}`)).status).toBe('queued');
    await failWork(await work(`triage-${id}`), new Error('db down'));
    const doubt = await Doubt.findById(id);
    expect(doubt.status).toBe('pending_review');
    expect(doubt.triage).toMatchObject({ source: 'fallback', error: 'triage_failed' });
    expect(await work(`draft-${id}`)).not.toBeNull();
  });
});

describe('daily doubt cap', () => {
  it('blocks the 11th doubt in a day and creates nothing for the blocked one', async () => {
    for (let i = 0; i < 10; i += 1) expect((await post(student)).status).toBe(201);
    const blocked = await post(student);
    expect(blocked.status).toBe(429);
    expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.headers['retry-after']).toBeTruthy();
    expect(await Doubt.countDocuments({ studentId: student.id })).toBe(10);
    expect((await post(other)).status).toBe(201);
  });
  it('counts doubts that triage removes', async () => {
    process.env.MAX_DOUBTS_PER_DAY = '2';
    const first = (await post(student)).body.doubt._id;
    verdict('unrelated', 0.99);
    await run(`triage-${first}`);
    expect((await post(student)).status).toBe(201);
    expect((await post(student)).status).toBe(429);
  });
  it('cannot be exceeded by parallel requests', async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => post(student)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    expect(await Doubt.countDocuments({ studentId: student.id })).toBe(10);
  });
});

describe('stuck-triage safeguard', () => {
  // createdAt is immutable in Mongoose, so age the row through the raw collection.
  const age = (id, minutes) => Doubt.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { createdAt: new Date(Date.now() - minutes * 60000) } });
  it('moves a doubt stuck in pending_triage to pending_review, fail-open, and queues the draft', async () => {
    const id = (await post(student)).body.doubt._id;
    await age(id, 6);
    await recoverDomainWork();
    const doubt = await Doubt.findById(id);
    expect(doubt.status).toBe('pending_review');
    expect(doubt.triage).toMatchObject({ source: 'fallback', error: 'triage_stuck', lowConfidence: true });
    expect(await work(`draft-${id}`)).toMatchObject({ type: 'doubt-draft' });
    await recoverDomainWork();
    expect(await WorkItem.countDocuments({ key: `draft-${id}` })).toBe(1);
    // A late triage job finds the doubt already decided and does nothing.
    verdict('unrelated', 0.99);
    await run(`triage-${id}`);
    expect((await Doubt.findById(id)).status).toBe('pending_review');
    expect(await Notification.countDocuments()).toBe(0);
  });
  it('leaves a recent doubt alone but makes sure its triage job exists', async () => {
    const id = (await post(student)).body.doubt._id;
    await WorkItem.deleteOne({ key: `triage-${id}` });
    await age(id, 2);
    await recoverDomainWork();
    expect((await Doubt.findById(id)).status).toBe('pending_triage');
    expect(await work(`triage-${id}`)).toMatchObject({ type: 'doubt-triage' });
    expect(await work(`draft-${id}`)).toBeNull();
  });
  it('honours TRIAGE_STUCK_MINUTES', async () => {
    process.env.TRIAGE_STUCK_MINUTES = '1';
    const id = (await post(student)).body.doubt._id;
    await age(id, 2);
    await recoverDomainWork();
    delete process.env.TRIAGE_STUCK_MINUTES;
    expect((await Doubt.findById(id)).status).toBe('pending_review');
  });
  it('never queues a draft for a doubt that is still waiting for triage', async () => {
    const id = (await post(student)).body.doubt._id;
    await recoverDomainWork();
    expect(await work(`draft-${id}`)).toBeNull();
  });
  it('re-sends a removal notification that was lost in a crash', async () => {
    const id = (await post(student)).body.doubt._id;
    verdict('unrelated', 0.95);
    await run(`triage-${id}`);
    await Notification.deleteMany({});
    await Doubt.updateOne({ _id: id }, { $unset: { removalNotifiedAt: 1 } }).setOptions({ includeRemoved: true });
    await recoverDomainWork();
    await recoverDomainWork();
    expect(await Notification.countDocuments({ userId: student.id })).toBe(1);
  });
});
