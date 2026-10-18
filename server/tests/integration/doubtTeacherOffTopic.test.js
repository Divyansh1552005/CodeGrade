import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import { registerAs } from '../helpers/users.js';

const svc = (p) => new URL(`../../services/${p}`, import.meta.url).pathname;
const generateDraftAnswer = jest.fn();
class NotRelevantError extends Error {}
jest.unstable_mockModule(svc('doubtDraftChain.js'), () => ({ generateDraftAnswer, NotRelevantError }));

const { createApp } = await import('../../app.js');
const Doubt = (await import('../../models/Doubt.js')).default;
const Answer = (await import('../../models/Answer.js')).default;
const WorkItem = (await import('../../models/WorkItem.js')).default;
const Notification = (await import('../../models/Notification.js')).default;
const { recoverDomainWork } = await import('../../services/recoveryService.js');

const app = createApp();
let student, other, teacher, teacher2;

async function register(role, name = role) {
  const res = await registerAs(app, { name, email: `${name}${Math.random()}@x.com`, password: 'password123', role });
  return { token: res.body.accessToken, id: res.body.user._id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const raw = (id) => Doubt.findById(id).setOptions({ includeRemoved: true });
const mark = (u, id, body = {}) => request(app).post(`/doubts/${id}/off-topic`).set(as(u)).send(body);
const waiting = (over = {}) => Doubt.create({ studentId: student.id, title: 'Cooking', body: 'Pasta?', status: 'pending_review', aiDraftStatus: 'failed', ...over });

beforeEach(async () => {
  generateDraftAnswer.mockReset();
  student = await register('student', 'author');
  other = await register('student', 'other');
  teacher = await register('teacher', 'teacher');
  teacher2 = await register('teacher', 'teacher2');
});

describe('a teacher marks a doubt off topic', () => {
  it('removes it from the board for everyone, and tells the student', async () => {
    const d = await waiting();
    const res = await mark(teacher, d.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: true, doubtId: d.id });
    expect(await raw(d.id)).toMatchObject({ status: 'auto_rejected', triage: expect.objectContaining({ source: 'teacher', verdict: 'unrelated' }) });
    for (const who of [student, other, teacher, teacher2]) {
      expect(JSON.stringify((await request(app).get('/doubts').set(as(who))).body)).not.toContain(d.id);
      expect((await request(app).get(`/doubts/${d.id}`).set(as(who))).status).toBe(404);
    }
    expect((await request(app).get('/doubts/failed').set(as(teacher2))).body.doubts).toHaveLength(0);
    const note = (await request(app).get('/notifications').set(as(student))).body.notifications[0];
    expect(note).toMatchObject({ type: 'doubt_removed', title: 'A teacher marked your doubt off topic', body: 'A teacher marked this doubt as not about programming.', link: `/doubts/${d.id}/removed` });
  });
  it('stores the teacher and an optional reason, shown to the student as plain text', async () => {
    const d = await waiting();
    await mark(teacher, d.id, { reason: 'This is a <b>cooking</b> question.\nNot code.' });
    const stored = await raw(d.id);
    expect(String(stored.triage.decidedBy)).toBe(teacher.id);
    const page = await request(app).get(`/doubts/${d.id}/removed`).set(as(student));
    expect(page.body.doubt).toMatchObject({ reason: 'This is a b cooking /b question. Not code.', removedBy: 'teacher', offTopic: true, canAppeal: true, appealUsed: false });
  });
  it('works on an appealed doubt and on an older doubt with no status, and rejects pending AI drafts', async () => {
    const appealed = await waiting({ status: 'appealed', aiDraftStatus: 'skipped', appeal: { requestedAt: new Date() } });
    const legacy = await Doubt.create({ studentId: student.id, title: 'Old', body: 'B' });
    const draft = await Answer.create({ doubtId: legacy.id, content: 'AI draft', source: 'ai', state: 'pending' });
    expect((await mark(teacher, appealed.id)).status).toBe(200);
    expect((await mark(teacher, legacy.id)).status).toBe(200);
    expect((await Answer.findById(draft.id)).state).toBe('rejected');
    expect((await request(app).get('/answers?state=pending').set(as(teacher))).body.answers).toHaveLength(0);
  });
  it('is teacher only', async () => {
    const d = await waiting();
    expect((await mark(student, d.id)).status).toBe(403);
    expect((await mark(other, d.id)).status).toBe(403);
    expect((await request(app).post(`/doubts/${d.id}/off-topic`)).status).toBe(401);
    expect((await raw(d.id)).status).toBe('pending_review');
  });
  it.each([['already removed', { status: 'auto_rejected' }], ['still being checked', { status: 'pending_triage' }]])('answers 404 for a doubt that is %s', async (_l, over) => {
    const d = await waiting(over);
    expect((await mark(teacher, d.id)).status).toBe(404);
    expect((await raw(d.id)).status).toBe(over.status);
  });
  it('answers 404 for an unknown id and 400 for a malformed one or a too long reason', async () => {
    expect((await mark(teacher, '507f1f77bcf86cd799439011')).status).toBe(404);
    expect((await mark(teacher, 'nope')).status).toBe(400);
    const d = await waiting();
    expect((await mark(teacher, d.id, { reason: 'x'.repeat(241) })).status).toBe(400);
  });
  it('refuses a doubt that already has an approved answer', async () => {
    const d = await waiting();
    const answer = await Answer.create({ doubtId: d.id, content: 'Answered', source: 'teacher', state: 'pending' });
    answer.state = 'approved'; answer.reviewedAt = new Date(); await answer.save();
    const res = await mark(teacher, d.id);
    expect(res.status).toBe(409);
    expect((await raw(d.id)).status).toBe('pending_review');
  });
  it('lets exactly one of several parallel requests through, with one notification', async () => {
    const d = await waiting();
    const results = await Promise.all([mark(teacher, d.id), mark(teacher2, d.id), mark(teacher, d.id), mark(teacher2, d.id)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 404)).toHaveLength(3);
    expect(await Notification.countDocuments({ userId: student.id })).toBe(1);
  });
});

describe('appeals after a teacher removes a doubt', () => {
  it('lets the student appeal once, and the doubt goes straight to a teacher with no AI', async () => {
    const d = await waiting();
    await mark(teacher, d.id);
    expect((await request(app).post(`/doubts/${d.id}/appeal`).set(as(student))).status).toBe(200);
    expect(generateDraftAnswer).not.toHaveBeenCalled();
    expect(await WorkItem.countDocuments({ type: 'doubt-draft' })).toBe(0);
    const queue = (await request(app).get('/doubts/failed').set(as(teacher2))).body.doubts;
    expect(queue.map((x) => x._id)).toEqual([d.id]);
    expect(queue[0].appealed).toBe(true);
  });
  it('does not allow a second appeal when a teacher removes an appealed doubt again', async () => {
    const d = await waiting();
    await mark(teacher, d.id);
    await request(app).post(`/doubts/${d.id}/appeal`).set(as(student));
    expect((await mark(teacher2, d.id)).status).toBe(200);
    // The student is told again, with a separate notification.
    const notes = (await request(app).get('/notifications').set(as(student))).body.notifications;
    expect(notes.filter((n) => n.type === 'doubt_removed')).toHaveLength(2);
    const page = await request(app).get(`/doubts/${d.id}/removed`).set(as(student));
    expect(page.status).toBe(200);
    expect(page.body.doubt).toMatchObject({ status: 'auto_rejected', canAppeal: false, appealUsed: true, appealed: false, removedBy: 'teacher' });
    const again = await request(app).post(`/doubts/${d.id}/appeal`).set(as(student));
    expect(again.status).toBe(409);
    expect((await raw(d.id)).status).toBe('auto_rejected');
    expect((await request(app).get('/doubts/failed').set(as(teacher))).body.doubts).toHaveLength(0);
  });
  it('also allows only one appeal when the AI removed it first and a teacher removes it after the appeal', async () => {
    const d = await waiting({ status: 'auto_rejected', triage: { verdict: 'unrelated', confidence: 0.95, reason: 'Off topic.', source: 'ai', model: 'm' } });
    await request(app).post(`/doubts/${d.id}/appeal`).set(as(student));
    await mark(teacher, d.id);
    expect((await request(app).post(`/doubts/${d.id}/appeal`).set(as(student))).status).toBe(409);
  });
  it('re-sends the teacher removal notification if it was lost in a crash, once', async () => {
    const d = await waiting();
    await mark(teacher, d.id);
    await Notification.deleteMany({});
    await Doubt.updateOne({ _id: d.id }, { $unset: { removalNotifiedAt: 1 } }).setOptions({ includeRemoved: true });
    await recoverDomainWork();
    await recoverDomainWork();
    const notes = await Notification.find({ userId: student.id });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('A teacher marked your doubt off topic');
  });
});
