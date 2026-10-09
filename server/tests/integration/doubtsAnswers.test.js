import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

const svc = (p) => new URL(`../../services/${p}`, import.meta.url).pathname;

jest.unstable_mockModule(svc('doubtDraftChain.js'), () => ({
  generateDraftAnswer: jest.fn(async () => ({
    draftAnswer: 'Consider using a hash map for O(n) lookups.',
  })),
  NotRelevantError: class NotRelevantError extends Error {},
}));

const { createApp } = await import('../../app.js');
const Answer = (await import('../../models/Answer.js')).default;
const { waitFor } = await import('../waitFor.js');

const WorkItem = (await import('../../models/WorkItem.js')).default;
const { processWork } = await import('../../services/workProcessor.js');
const app = createApp();

async function register(role) {
  const res = await request(app).post('/auth/register').send({
    name: role,
    email: `${role}${Math.random()}@x.com`,
    password: 'password123',
    role,
  });
  return res.body.accessToken;
}

async function createDoubt(token) {
  const res = await request(app)
    .post('/doubts')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Why is my loop slow?', body: 'It is O(n^2), how to fix?' });
  // Execute the queued draft explicitly; tests never connect to Redis.
  const work = await WorkItem.findOne({ key: `draft-${res.body.doubt._id}` });
  await processWork({ data: { workItemId: work.id }, attemptsMade: 0, opts: { attempts: 3 } });
  await waitFor(() => Answer.findOne({ doubtId: res.body.doubt._id }));
  return res.body.doubt;
}

let studentToken;
let teacherToken;

beforeEach(async () => {
  studentToken = await register('student');
  teacherToken = await register('teacher');
});

describe('GET /doubts?mine=1', () => {
  it("returns only the requesting student's own doubts", async () => {
    await createDoubt(studentToken);
    const otherStudentToken = await register('student');
    await createDoubt(otherStudentToken);

    const res = await request(app)
      .get('/doubts?mine=1')
      .set('Authorization', `Bearer ${otherStudentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.doubts.length).toBe(1);
  });
});

describe('Doubt -> AI draft -> approval workflow', () => {
  it('creates an AI draft in pending state, invisible to students until approved', async () => {
    const doubt = await createDoubt(studentToken);

    // The pending answer must NOT be visible via the student-facing endpoint.
    const visible = await request(app)
      .get(`/doubts/${doubt._id}/answer`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(visible.status).toBe(200);
    expect(visible.body.answer).toBeNull();

    // But it exists in pending state.
    const stored = await Answer.findOne({ doubtId: doubt._id });
    expect(stored.state).toBe('pending');
    expect(stored.source).toBe('ai');
  });

  it('lets a teacher approve, making the answer visible', async () => {
    const doubt = await createDoubt(studentToken);
    const answer = await Answer.findOne({ doubtId: doubt._id });

    const approve = await request(app)
      .patch(`/answers/${answer._id}/approve`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.answer.state).toBe('approved');

    const visible = await request(app)
      .get(`/doubts/${doubt._id}/answer`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(visible.body.answer.state).toBe('approved');
    // The answer carries the reviewing teacher (for "answered by …" display).
    expect(visible.body.answer.reviewedBy).toBeTruthy();
    expect(visible.body.answer.reviewedBy.name).toBe('teacher');
  });

  it('returns 400 when approving an already-approved answer (state unchanged)', async () => {
    const doubt = await createDoubt(studentToken);
    const answer = await Answer.findOne({ doubtId: doubt._id });

    await request(app)
      .patch(`/answers/${answer._id}/approve`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({});

    const again = await request(app)
      .patch(`/answers/${answer._id}/approve`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({});
    expect(again.status).toBe(400);

    const fresh = await Answer.findById(answer._id);
    expect(fresh.state).toBe('approved');
  });

  it('returns 400 when approving a rejected answer', async () => {
    const doubt = await createDoubt(studentToken);
    const answer = await Answer.findOne({ doubtId: doubt._id });

    await request(app)
      .patch(`/answers/${answer._id}/reject`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ reviewNotes: 'inaccurate' });

    const approve = await request(app)
      .patch(`/answers/${answer._id}/approve`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({});
    expect(approve.status).toBe(400);
    const fresh = await Answer.findById(answer._id);
    expect(fresh.state).toBe('rejected');
  });

  it('forbids a student from approving (403)', async () => {
    const doubt = await createDoubt(studentToken);
    const answer = await Answer.findOne({ doubtId: doubt._id });

    const res = await request(app)
      .patch(`/answers/${answer._id}/approve`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('forbids a student from viewing the teacher review queue (403)', async () => {
    const res = await request(app)
      .get('/answers?state=pending')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});
