import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

const svc = (p) => new URL(`../../services/${p}`, import.meta.url).pathname;
const classify = jest.fn();
jest.unstable_mockModule(svc('doubtTriageChain.js'), () => ({ classifyDoubt: classify }));
const generateDraftAnswer = jest.fn();
class NotRelevantError extends Error {}
jest.unstable_mockModule(svc('doubtDraftChain.js'), () => ({ generateDraftAnswer, NotRelevantError }));

const { createApp } = await import('../../app.js');
const Doubt = (await import('../../models/Doubt.js')).default;
const Answer = (await import('../../models/Answer.js')).default;
const WorkItem = (await import('../../models/WorkItem.js')).default;
const Notification = (await import('../../models/Notification.js')).default;
const { processWork } = await import('../../services/workProcessor.js');
const { recoverDomainWork } = await import('../../services/recoveryService.js');

const app = createApp();
let student, other, teacher;

async function register(role, name = role) {
  const res = await request(app).post('/auth/register').send({ name, email: `${name}${Math.random()}@x.com`, password: 'password123', role });
  return { token: res.body.accessToken, id: res.body.user._id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const run = async (key) => processWork({ data: { workItemId: (await WorkItem.findOne({ key })).id }, attemptsMade: 0, opts: { attempts: 3 } });
const removedDoubt = (over = {}) => Doubt.create({
  studentId: student.id, title: 'Dinner?', body: 'What should I cook?', status: 'auto_rejected',
  triage: { verdict: 'unrelated', confidence: 0.97, reason: 'This is about cooking, not programming.', model: 'm', source: 'ai' }, ...over,
});

beforeEach(async () => {
  process.env.FEATURE_AI_TRIAGE = 'true';
  classify.mockReset(); generateDraftAnswer.mockReset();
  generateDraftAnswer.mockResolvedValue({ draftAnswer: 'A draft answer.' });
  student = await register('student', 'author');
  other = await register('student', 'other');
  teacher = await register('teacher');
});
afterEach(() => { delete process.env.FEATURE_AI_TRIAGE; });

describe('GET /doubts/:id/removed', () => {
  it('shows the owner the reason and the appeal option, and nothing about the model', async () => {
    const d = await removedDoubt();
    const res = await request(app).get(`/doubts/${d.id}/removed`).set(as(student));
    expect(res.status).toBe(200);
    expect(res.body.doubt).toMatchObject({ id: d.id, title: 'Dinner?', reason: 'This is about cooking, not programming.', canAppeal: true, appealed: false, status: 'auto_rejected' });
    expect(JSON.stringify(res.body)).not.toMatch(/confidence|verdict|model|0\.97/);
  });
  it.each([['another student', () => other], ['a teacher', () => teacher]])('answers 404 for %s', async (_label, who) => {
    const d = await removedDoubt();
    expect((await request(app).get(`/doubts/${d.id}/removed`).set(as(who()))).status).toBe(404);
  });
  it('requires login', async () => {
    const d = await removedDoubt();
    expect((await request(app).get(`/doubts/${d.id}/removed`)).status).toBe(401);
  });
  it.each([
    ['a normal doubt', { status: 'pending_review' }],
    ['a doubt still being checked', { status: 'pending_triage' }],
    ['an older doubt with no status', { status: undefined, triage: undefined }],
  ])('answers 404 for %s, even for the owner', async (_label, over) => {
    const d = await removedDoubt(over);
    expect((await request(app).get(`/doubts/${d.id}/removed`).set(as(student))).status).toBe(404);
  });
  it('answers 404 for an unknown id and 400 for a malformed one', async () => {
    expect((await request(app).get('/doubts/507f1f77bcf86cd799439011/removed').set(as(student))).status).toBe(404);
    expect((await request(app).get('/doubts/nope/removed').set(as(student))).status).toBe(400);
  });
  it('is not listed anywhere and the normal detail route 404s', async () => {
    const d = await removedDoubt();
    expect((await request(app).get(`/doubts/${d.id}`).set(as(student))).status).toBe(404);
    for (const who of [student, other, teacher]) {
      expect(JSON.stringify((await request(app).get('/doubts').set(as(who))).body)).not.toContain(d.id);
    }
    expect(JSON.stringify((await request(app).get('/doubts?mine=1').set(as(student))).body)).not.toContain(d.id);
  });
  it('is reached from the removal notification created by triage', async () => {
    const posted = await request(app).post('/doubts').set(as(student)).send({ title: 'Dinner?', body: 'What should I cook tonight?' });
    classify.mockResolvedValue({ result: { verdict: 'unrelated', confidence: 0.96, reason: 'This is about cooking, not programming.' } });
    await run(`triage-${posted.body.doubt._id}`);
    const note = (await request(app).get('/notifications').set(as(student))).body.notifications[0];
    expect(note).toMatchObject({ type: 'doubt_removed', body: 'This is about cooking, not programming.' });
    const page = await request(app).get(note.link).set(as(student));
    expect(page.status).toBe(200);
    expect(page.body.doubt.reason).toBe('This is about cooking, not programming.');
  });
});

describe('POST /doubts/:id/appeal', () => {
  it('moves the doubt to appealed, queues one draft, and makes it visible to teachers with an appealed marker', async () => {
    const d = await removedDoubt();
    const res = await request(app).post(`/doubts/${d.id}/appeal`).set(as(student));
    expect(res.status).toBe(200);
    expect(res.body.doubt).toMatchObject({ status: 'appealed', appealed: true, canAppeal: false });
    const stored = await Doubt.findById(d.id);
    expect(stored.status).toBe('appealed');
    expect(stored.appeal.requestedAt).toBeInstanceOf(Date);
    expect(await WorkItem.countDocuments({ key: `draft-${d.id}` })).toBe(1);
    expect((await request(app).get(`/doubts/${d.id}`).set(as(other))).status).toBe(200);
    expect((await request(app).get(`/doubts/${d.id}`).set(as(teacher))).body.doubt.appealed).toBe(true);
  });
  it('enters the teacher queue exactly once and carries the marker', async () => {
    const d = await removedDoubt();
    await request(app).post(`/doubts/${d.id}/appeal`).set(as(student));
    await run(`draft-${d.id}`);
    await recoverDomainWork();
    await recoverDomainWork();
    expect(await Answer.countDocuments({ doubtId: d.id })).toBe(1);
    expect(await WorkItem.countDocuments({ key: `draft-${d.id}` })).toBe(1);
    const queue = (await request(app).get('/answers?state=pending').set(as(teacher))).body.answers;
    expect(queue).toHaveLength(1);
    expect(queue[0].doubtId).toMatchObject({ _id: d.id, appealed: true });
  });
  it('lands in the manual queue with the marker when the AI cannot draft an answer', async () => {
    const d = await removedDoubt();
    await request(app).post(`/doubts/${d.id}/appeal`).set(as(student));
    generateDraftAnswer.mockRejectedValue(new NotRelevantError());
    await run(`draft-${d.id}`);
    const failed = (await request(app).get('/doubts/failed').set(as(teacher))).body.doubts;
    expect(failed.map((x) => x._id)).toEqual([d.id]);
    expect(failed[0].appealed).toBe(true);
  });
  it('allows only one appeal per doubt', async () => {
    const d = await removedDoubt();
    expect((await request(app).post(`/doubts/${d.id}/appeal`).set(as(student))).status).toBe(200);
    const again = await request(app).post(`/doubts/${d.id}/appeal`).set(as(student));
    expect(again.status).toBe(409);
    expect(await WorkItem.countDocuments({ key: `draft-${d.id}` })).toBe(1);
  });
  it('lets exactly one of several parallel appeals through', async () => {
    const d = await removedDoubt();
    const results = await Promise.all(Array.from({ length: 6 }, () => request(app).post(`/doubts/${d.id}/appeal`).set(as(student))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await WorkItem.countDocuments({ key: `draft-${d.id}` })).toBe(1);
  });
  it('is owner only: 404 for another student, 403 for a teacher, 401 without login, and nothing changes', async () => {
    const d = await removedDoubt();
    expect((await request(app).post(`/doubts/${d.id}/appeal`).set(as(other))).status).toBe(404);
    expect((await request(app).post(`/doubts/${d.id}/appeal`).set(as(teacher))).status).toBe(403);
    expect((await request(app).post(`/doubts/${d.id}/appeal`)).status).toBe(401);
    expect((await Doubt.findById(d.id).setOptions({ includeRemoved: true })).status).toBe('auto_rejected');
    expect(await WorkItem.countDocuments({ type: 'doubt-draft' })).toBe(0);
  });
  it.each([['a normal doubt', 'pending_review'], ['a doubt being checked', 'pending_triage']])('answers 404 for %s', async (_l, status) => {
    const d = await removedDoubt({ status });
    expect((await request(app).post(`/doubts/${d.id}/appeal`).set(as(student))).status).toBe(404);
  });
  it('lets the owner still open the removed page afterwards, now showing the appeal was sent', async () => {
    const d = await removedDoubt();
    await request(app).post(`/doubts/${d.id}/appeal`).set(as(student));
    const res = await request(app).get(`/doubts/${d.id}/removed`).set(as(student));
    expect(res.status).toBe(200);
    expect(res.body.doubt).toMatchObject({ appealed: true, canAppeal: false });
    expect((await request(app).get(`/doubts/${d.id}`).set(as(student))).status).toBe(200);
  });
  it('recovers the draft job if the process dies right after the status change', async () => {
    const d = await removedDoubt();
    await Doubt.updateOne({ _id: d.id }, { $set: { status: 'appealed', 'appeal.requestedAt': new Date() } });
    expect(await WorkItem.countDocuments({ key: `draft-${d.id}` })).toBe(0);
    await recoverDomainWork();
    await recoverDomainWork();
    expect(await WorkItem.countDocuments({ key: `draft-${d.id}` })).toBe(1);
  });
  it('does not create notifications for the appeal', async () => {
    const d = await removedDoubt();
    await request(app).post(`/doubts/${d.id}/appeal`).set(as(student));
    expect(await Notification.countDocuments({ userId: student.id })).toBe(0);
  });
});
