import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

const svc = (p) => new URL(`../../services/${p}`, import.meta.url).pathname;

// --- Mock the Judge0 HTTP layer: always "Accept" and echo expected output. ---
const post = jest.fn();
const get = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { create: () => ({ post, get }) },
}));

// --- Mock the AI feedback chain so no real LLM is called. ---
jest.unstable_mockModule(svc('aiFeedbackChain.js'), () => ({
  generateFeedback: jest.fn(async () => ({
    summary: 'Nice work',
    strengths: ['readable'],
    improvements: ['edge cases'],
    complexityNote: 'O(n)',
  })),
}));

const { createApp } = await import('../../app.js');
const User = (await import('../../models/User.js')).default;
const Problem = (await import('../../models/Problem.js')).default;

const app = createApp();

async function registerStudent() {
  const res = await request(app).post('/auth/register').send({
    name: 'Stu',
    email: `stu${Math.random()}@x.com`,
    password: 'password123',
    role: 'student',
  });
  return res.body.accessToken;
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('POST /submissions', () => {
  it('runs code, stores results, and populates aiFeedback', async () => {
    const token = await registerStudent();
    const problem = await Problem.create({
      title: 'Echo',
      testCases: [
        { input: '2', expectedOutput: '4' },
        { input: '3', expectedOutput: '6' },
      ],
    });

    // Judge0 returns the expected output for each case -> both pass.
    post
      .mockResolvedValueOnce({ data: { stdout: '4\n', status: { id: 3 } } })
      .mockResolvedValueOnce({ data: { stdout: '6\n', status: { id: 3 } } });

    // Language is chosen by the student at submit time.
    const res = await request(app)
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'print(int(input())*2)', language: 'python' });

    expect(res.status).toBe(201);
    expect(res.body.submission.status).toBe('graded');
    expect(res.body.submission.language).toBe('python');
    expect(res.body.submission.passCount).toBe(2);
    expect(res.body.submission.totalCount).toBe(2);
    expect(res.body.submission.aiFeedback.summary).toBe('Nice work');
  });

  it('marks the problem "solved" and lists it under the student submissions', async () => {
    const token = await registerStudent();
    const problem = await Problem.create({
      title: 'Echo2',
      testCases: [{ input: '2', expectedOutput: '4' }],
    });
    post.mockResolvedValueOnce({ data: { stdout: '4\n', status: { id: 3 } } });

    await request(app)
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'print(int(input())*2)', language: 'python' });

    // The problem now shows solved:true for this student.
    const list = await request(app).get('/problems').set('Authorization', `Bearer ${token}`);
    const found = list.body.problems.find((p) => p._id === problem._id.toString());
    expect(found.solved).toBe(true);

    // Filtered submissions for this problem come back.
    const subs = await request(app)
      .get(`/submissions?problemId=${problem._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(subs.body.submissions).toHaveLength(1);
    expect(subs.body.submissions[0].passCount).toBe(1);
  });

  it('does NOT mark a problem solved when not all tests pass', async () => {
    const token = await registerStudent();
    const problem = await Problem.create({
      title: 'Echo3',
      testCases: [
        { input: '2', expectedOutput: '4' },
        { input: '3', expectedOutput: '6' },
      ],
    });
    // First case passes, second fails.
    post
      .mockResolvedValueOnce({ data: { stdout: '4\n', status: { id: 3 } } })
      .mockResolvedValueOnce({ data: { stdout: '99\n', status: { id: 3 } } });

    await request(app)
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'x', language: 'python' });

    const list = await request(app).get('/problems').set('Authorization', `Bearer ${token}`);
    const found = list.body.problems.find((p) => p._id === problem._id.toString());
    expect(found.solved).toBe(false);
  });

  it('rejects oversized code before reaching Judge0', async () => {
    const token = await registerStudent();
    const problem = await Problem.create({ title: 'P', testCases: [] });
    const huge = 'a'.repeat(20001);

    const res = await request(app)
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: huge, language: 'python' });

    expect(res.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/submissions')
      .send({ problemId: 'x', code: 'y', language: 'python' });
    expect(res.status).toBe(401);
  });
});
