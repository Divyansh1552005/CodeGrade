import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

const svc = (p) => new URL(`../../services/${p}`, import.meta.url).pathname;

// Mock Judge0 (axios) so a student submission "runs" without a real network call.
const post = jest.fn();
const get = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { create: () => ({ post, get }) },
}));

// Mock both AI chains so no real LLM is hit.
jest.unstable_mockModule(svc('aiFeedbackChain.js'), () => ({
  generateFeedback: jest.fn(async () => ({
    summary: 's',
    strengths: [],
    improvements: [],
    complexityNote: 'O(1)',
  })),
}));
jest.unstable_mockModule(svc('doubtDraftChain.js'), () => ({
  generateDraftAnswer: jest.fn(async () => ({ draftAnswer: 'draft' })),
}));

const { createApp } = await import('../../app.js');
const Problem = (await import('../../models/Problem.js')).default;

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

beforeEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('RBAC: POST /doubts is student-only', () => {
  it('forbids a teacher from posting a doubt (403)', async () => {
    const token = await register('teacher');
    const res = await request(app)
      .post('/doubts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x', body: 'y' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/student/i);
  });

  it('allows a student to post a doubt (201)', async () => {
    const token = await register('student');
    const res = await request(app)
      .post('/doubts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Real question', body: 'How does recursion work?' });
    expect(res.status).toBe(201);
    expect(res.body.doubt).toBeDefined();
  });
});

describe('RBAC: POST /submissions is student-only', () => {
  it('forbids a teacher from submitting code (403)', async () => {
    const token = await register('teacher');
    const problem = await Problem.create({ title: 'P', testCases: [] });
    const res = await request(app)
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'print(1)', language: 'python' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/student/i);
    // The guard runs before any execution.
    expect(post).not.toHaveBeenCalled();
  });

  it('allows a student to submit code (201)', async () => {
    const token = await register('student');
    const problem = await Problem.create({
      title: 'Echo',
      testCases: [{ input: '2', expectedOutput: '4' }],
    });
    post.mockResolvedValueOnce({ data: { stdout: '4\n', status: { id: 3 } } });

    const res = await request(app)
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'print(int(input())*2)', language: 'python' });

    expect(res.status).toBe(201);
    expect(res.body.submission.status).toBe('graded');
    expect(res.body.submission.passCount).toBe(1);
  });
});
