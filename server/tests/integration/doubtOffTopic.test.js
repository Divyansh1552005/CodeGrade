import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import { registerAs } from '../helpers/users.js';
import { draftWork } from '../helpers/doubts.js';

const svc = (p) => new URL(`../../services/${p}`, import.meta.url).pathname;
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
  const res = await registerAs(app, { name, email: `${name}${Math.random()}@x.com`, password: 'password123', role });
  return { token: res.body.accessToken, id: res.body.user._id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const runDraft = async (id) => processWork({ data: { workItemId: (await draftWork(id)).id }, attemptsMade: 0, opts: { attempts: 3 } });
const raw = (id) => Doubt.findById(id).setOptions({ includeRemoved: true });
const post = (title = 'How do I cook pasta?') => request(app).post('/doubts').set(as(student)).send({ title, body: 'Boil water, add pasta.' });

beforeEach(async () => {
  generateDraftAnswer.mockReset();
  student = await register('student', 'author');
  other = await register('student', 'other');
  teacher = await register('teacher');
});

describe('a doubt the AI marks off topic', () => {
  it('is removed: hidden from the board, the author\'s list and the teachers, with no answer', async () => {
    generateDraftAnswer.mockRejectedValue(new NotRelevantError());
    const id = (await post()).body.doubt._id;
    await runDraft(id);
    expect(await raw(id)).toMatchObject({ status: 'auto_rejected', aiDraftStatus: 'irrelevant' });
    for (const who of [student, other, teacher]) {
      expect(JSON.stringify((await request(app).get('/doubts').set(as(who))).body)).not.toContain(id);
      expect((await request(app).get(`/doubts/${id}`).set(as(who))).status).toBe(404);
    }
    expect(JSON.stringify((await request(app).get('/doubts?mine=1').set(as(student))).body)).not.toContain(id);
    // The first time round, it does not go to a teacher.
    expect((await request(app).get('/doubts/failed').set(as(teacher))).body.doubts).toHaveLength(0);
    expect((await request(app).get('/answers?state=pending').set(as(teacher))).body.answers).toHaveLength(0);
    expect(await Answer.countDocuments({ doubtId: id })).toBe(0);
  });
  it('tells the student it was marked off topic, with a link to the page where they can appeal', async () => {
    generateDraftAnswer.mockRejectedValue(new NotRelevantError());
    const id = (await post()).body.doubt._id;
    await runDraft(id);
    const note = (await request(app).get('/notifications').set(as(student))).body.notifications[0];
    expect(note).toMatchObject({ type: 'doubt_removed', title: 'Your doubt was marked off topic', link: `/doubts/${id}/removed` });
    const page = await request(app).get(note.link).set(as(student));
    expect(page.body.doubt).toMatchObject({ offTopic: true, canAppeal: true, reason: 'This does not look like a question about programming.' });
    expect((await request(app).get(note.link).set(as(other))).status).toBe(404);
    expect((await request(app).get(note.link).set(as(teacher))).status).toBe(404);
  });
  it('removes it once the draft marks it off topic, whatever triage said earlier', async () => {
    generateDraftAnswer.mockRejectedValue(new NotRelevantError());
    const id = (await post()).body.doubt._id;
    expect((await raw(id)).status).toBe('pending_triage');
    await runDraft(id);
    expect((await raw(id)).status).toBe('auto_rejected');
  });
  it('notifies once even if the draft job runs twice', async () => {
    generateDraftAnswer.mockRejectedValue(new NotRelevantError());
    const id = (await post()).body.doubt._id;
    await runDraft(id);
    await runDraft(id);
    expect(await Notification.countDocuments({ userId: student.id })).toBe(1);
  });
  it('is not removed if a teacher has already answered it', async () => {
    const id = (await post()).body.doubt._id;
    generateDraftAnswer.mockImplementation(async () => {
      await request(app).post('/answers').set(as(teacher)).send({ doubtId: id, content: 'Answered by hand.' });
      throw new NotRelevantError();
    });
    await runDraft(id);
    const doubt = await raw(id);
    expect(doubt.status).not.toBe('auto_rejected');
    expect(await Notification.countDocuments()).toBe(0);
  });
  it('can be appealed once, and then goes straight to the teachers for a manual answer with no AI', async () => {
    generateDraftAnswer.mockRejectedValue(new NotRelevantError());
    const id = (await post()).body.doubt._id;
    await runDraft(id);
    generateDraftAnswer.mockClear();
    expect((await request(app).post(`/doubts/${id}/appeal`).set(as(student))).status).toBe(200);
    expect((await request(app).post(`/doubts/${id}/appeal`).set(as(student))).status).toBe(409);
    expect(generateDraftAnswer).not.toHaveBeenCalled();
    const queue = (await request(app).get('/doubts/failed').set(as(teacher))).body.doubts;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ _id: id, appealed: true });
    expect((await request(app).get('/doubts').set(as(other))).body.doubts.map((d) => d._id)).toContain(id);
  });
});

describe('doubts marked off topic before this change', () => {
  const legacy = (over = {}) => Doubt.create({ studentId: student.id, title: 'Cooking', body: 'Recipe', aiDraftStatus: 'irrelevant', ...over });
  it('are hidden and the student is told, once, when recovery runs', async () => {
    const d = await legacy();
    expect((await request(app).get('/doubts').set(as(other))).body.doubts.map((x) => x._id)).toContain(d.id);
    await recoverDomainWork();
    await recoverDomainWork();
    expect((await raw(d.id)).status).toBe('auto_rejected');
    expect((await request(app).get('/doubts').set(as(other))).body.doubts.map((x) => x._id)).not.toContain(d.id);
    expect((await request(app).get('/doubts/failed').set(as(teacher))).body.doubts).toHaveLength(0);
    const notes = await Notification.find({ userId: student.id });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Your doubt was marked off topic');
  });
  it('stay visible when a teacher has already answered them', async () => {
    const d = await legacy();
    const answer = await Answer.create({ doubtId: d.id, content: 'Human answer', source: 'teacher', state: 'pending' });
    answer.state = 'approved'; answer.reviewedAt = new Date(); await answer.save();
    await recoverDomainWork();
    expect((await raw(d.id)).status).toBeUndefined();
    expect(await Notification.countDocuments({ userId: student.id, key: /^doubt-removed/ })).toBe(0);
  });
  it('are left alone once appealed', async () => {
    const d = await legacy({ status: 'appealed', appeal: { requestedAt: new Date() } });
    await recoverDomainWork();
    expect((await raw(d.id)).status).toBe('appealed');
  });
});
