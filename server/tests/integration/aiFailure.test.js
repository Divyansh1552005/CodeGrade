import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

const svc = (p) => new URL(`../../services/${p}`, import.meta.url).pathname;

// The doubt-draft chain is mocked to THROW, simulating an LLM failure / timeout
// / schema-validation error.
const generateDraftAnswer = jest.fn();
class NotRelevantError extends Error {}
jest.unstable_mockModule(svc('doubtDraftChain.js'), () => ({
  generateDraftAnswer,
  NotRelevantError,
}));

const { createApp } = await import('../../app.js');
const Doubt = (await import('../../models/Doubt.js')).default;
const Answer = (await import('../../models/Answer.js')).default;
const { waitFor } = await import('../waitFor.js');

const WorkItem = (await import('../../models/WorkItem.js')).default;
const { processWork } = await import('../../services/workProcessor.js');
const app = createApp();

// Wait for the background AI processing to resolve the doubt's status.
const waitForStatus = async (doubtId, status) => {
  const work = await WorkItem.findOne({ key: `draft-${doubtId}` });
  await processWork({ data: { workItemId: work.id }, attemptsMade: 2, opts: { attempts: 3 } }).catch(() => {});
  return waitFor(async () => {
    const d = await Doubt.findById(doubtId).setOptions({ includeRemoved: true });
    return d && d.aiDraftStatus === status ? d : null;
  });
};

async function register(role) {
  const res = await request(app).post('/auth/register').send({
    name: role,
    email: `${role}${Math.random()}@x.com`,
    password: 'password123',
    role,
  });
  return res.body.accessToken;
}

let studentToken;
let teacherToken;

beforeEach(async () => {
  generateDraftAnswer.mockReset();
  studentToken = await register('student');
  teacherToken = await register('teacher');
});

describe('AI draft failure handling', () => {
  it('marks aiDraftStatus "failed" and creates NO Answer when the chain throws', async () => {
    generateDraftAnswer.mockRejectedValue(new Error('LLM exploded'));

    const res = await request(app)
      .post('/doubts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Broken', body: 'trigger a failure' });

    // Posts immediately; draft status starts 'pending' (background processing).
    expect(res.status).toBe(201);
    expect(res.body.doubt.aiDraftStatus).toBe('pending');

    // Background job resolves it to 'failed'.
    await waitForStatus(res.body.doubt._id, 'failed');

    // No Answer record was created for this doubt.
    const answers = await Answer.find({ doubtId: res.body.doubt._id });
    expect(answers).toHaveLength(0);
  });

  it('marks aiDraftStatus "success" and creates a pending Answer when the chain succeeds', async () => {
    generateDraftAnswer.mockResolvedValue({ draftAnswer: 'Here is a draft.' });

    const res = await request(app)
      .post('/doubts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Works', body: 'ok' });

    await waitForStatus(res.body.doubt._id, 'success');
    const answer = await Answer.findOne({ doubtId: res.body.doubt._id });
    expect(answer.source).toBe('ai');
    expect(answer.state).toBe('pending');
  });

  it('removes the doubt (aiDraftStatus "irrelevant") and creates NO Answer when the doubt is off-topic', async () => {
    generateDraftAnswer.mockRejectedValue(new NotRelevantError());

    const res = await request(app)
      .post('/doubts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'How to cook Maggi', body: 'boil water, add noodles...' });

    expect(res.status).toBe(201);
    await waitForStatus(res.body.doubt._id, 'irrelevant');

    const answers = await Answer.find({ doubtId: res.body.doubt._id });
    expect(answers).toHaveLength(0);

    // An off-topic doubt is removed: it is NOT in the teacher queue, and the student is told.
    const queue = await request(app)
      .get('/doubts/failed')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(queue.body.doubts.map((d) => d._id)).not.toContain(res.body.doubt._id);
    const removed = await Doubt.findById(res.body.doubt._id).setOptions({ includeRemoved: true });
    expect(removed.status).toBe('auto_rejected');
  });

  it('lists failed doubts for the teacher via GET /doubts/failed', async () => {
    generateDraftAnswer.mockRejectedValue(new Error('boom'));
    const res = await request(app)
      .post('/doubts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Needs manual', body: 'help' });
    const doubtId = res.body.doubt._id;
    await waitForStatus(doubtId, 'failed');

    const queue = await request(app)
      .get('/doubts/failed')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(queue.status).toBe(200);
    expect(queue.body.doubts.map((d) => d._id)).toContain(doubtId);

    // Students may not access the teacher queue.
    const forbidden = await request(app)
      .get('/doubts/failed')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(forbidden.status).toBe(403);
  });
});

describe('Teacher manual answer on a failed-AI doubt', () => {
  it('creates an Answer with source "teacher" and state "approved"', async () => {
    generateDraftAnswer.mockRejectedValue(new Error('boom'));
    const doubtRes = await request(app)
      .post('/doubts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Manual please', body: 'q' });
    const doubtId = doubtRes.body.doubt._id;
    await waitForStatus(doubtId, 'failed');

    const res = await request(app)
      .post('/answers')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ doubtId, content: 'Here is the manual answer.' });

    expect(res.status).toBe(201);
    expect(res.body.answer.source).toBe('teacher');
    expect(res.body.answer.state).toBe('approved');

    // The student can now see it as the approved answer.
    const visible = await request(app)
      .get(`/doubts/${doubtId}/answer`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(visible.body.answer.content).toBe('Here is the manual answer.');

    // And it drops off the failed queue (now answered).
    const queue = await request(app)
      .get('/doubts/failed')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(queue.body.doubts.map((d) => d._id)).not.toContain(doubtId);
  });

  it('forbids a student from posting a manual answer (403)', async () => {
    const doubtRes = await request(app)
      .post('/doubts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'x', body: 'y' });
    const res = await request(app)
      .post('/answers')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ doubtId: doubtRes.body.doubt._id, content: 'sneaky' });
    expect(res.status).toBe(403);
  });
});
