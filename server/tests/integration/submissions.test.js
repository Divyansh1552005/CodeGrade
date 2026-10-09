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

const enqueueSubmission = jest.fn(async () => {});
jest.unstable_mockModule(svc('submissionQueue.js'), () => ({ enqueueSubmission }));
const Submission = (await import('../../models/Submission.js')).default;
const { generateFeedback } = await import('../../services/aiFeedbackChain.js');
const WorkItem = (await import('../../models/WorkItem.js')).default;
const { processWork } = await import('../../services/workProcessor.js');
const { processSubmission, processFeedback } = await import('../../services/submissionProcessor.js');
const { createApp } = await import('../../app.js');
const User = (await import('../../models/User.js')).default;
const Problem = (await import('../../models/Problem.js')).default;

const app = createApp();

// judge0Client sends/receives base64 now, so mocked Judge0 responses must be
// base64-encoded too (see services/judge0Client.js).
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

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
  enqueueSubmission.mockReset().mockResolvedValue(undefined);
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
      .mockResolvedValueOnce({ data: { stdout: b64('4\n'), status: { id: 3 } } })
      .mockResolvedValueOnce({ data: { stdout: b64('6\n'), status: { id: 3 } } });

    // Language is chosen by the student at submit time.
    const res = await request(app)
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'print(int(input())*2)', language: 'python' });

    expect(res.status).toBe(202);
    expect(res.body.submission.status).toBe('queued');
    expect(post).not.toHaveBeenCalled();
    await processSubmission({ data: { submissionId: res.body.submissionId, testCases: problem.testCases } });
    await processFeedback({ data: { submissionId: res.body.submissionId } });
    const completed = await request(app).get(`/submissions/${res.body.submissionId}`).set('Authorization', `Bearer ${token}`);
    res.body = completed.body;
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
    post.mockResolvedValueOnce({ data: { stdout: b64('4\n'), status: { id: 3 } } });

    const accepted = await request(app)
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'print(int(input())*2)', language: 'python' });

    await processSubmission({ data: { submissionId: accepted.body.submissionId, testCases: problem.testCases } });

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
      .mockResolvedValueOnce({ data: { stdout: b64('4\n'), status: { id: 3 } } })
      .mockResolvedValueOnce({ data: { stdout: b64('99\n'), status: { id: 3 } } });

    const accepted = await request(app)
      .post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'x', language: 'python' });

    await processSubmission({ data: { submissionId: accepted.body.submissionId, testCases: problem.testCases } });
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

  it('returns 503 and marks the document error when enqueue fails', async () => {
    const token = await registerStudent();
    const problem = await Problem.create({ title: 'P', testCases: [] });
    enqueueSubmission.mockRejectedValueOnce(new Error('Outbox unavailable'));
    const res = await request(app).post('/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem.id, code: 'x', language: 'python' });
    expect(res.status).toBe(503);
    expect((await Submission.findOne({ problemId: problem.id })).status).toBe('error');
    expect(post).not.toHaveBeenCalled();
  });

  it('persists execution failure and skips regrading completed deliveries', async () => {
    const student = await User.create({ name: 'Stu', email: 'worker@x.com', passwordHash: 'hash', role: 'student' });
    const problem = await Problem.create({ title: 'P', testCases: [{ input: '', expectedOutput: '1' }] });
    const submission = await Submission.create({ studentId: student.id, problemId: problem.id, code: 'x', language: 'python' });
    const job = { data: { submissionId: submission.id, testCases: problem.testCases } };
    post.mockRejectedValueOnce(new Error('Judge unavailable'));
    await expect(processSubmission(job)).rejects.toThrow();
    expect((await Submission.findById(submission.id)).status).toBe('error');
    post.mockResolvedValueOnce({ data: { stdout: b64('1'), status: { id: 3 } } });
    await processSubmission(job);
    generateFeedback.mockRejectedValueOnce(new Error('AI unavailable'));
    const feedbackWork = await WorkItem.findOne({ key: `feedback-${submission.id}` });
    await expect(processWork({ data: { workItemId: feedbackWork.id }, attemptsMade: 0, opts: { attempts: 1 } })).rejects.toThrow('AI unavailable');
    expect((await Submission.findById(submission.id)).feedbackStatus).toBe('failed');
    expect((await Submission.findById(submission.id)).status).toBe('graded');
    await processSubmission(job);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/submissions')
      .send({ problemId: 'x', code: 'y', language: 'python' });
    expect(res.status).toBe(401);
  });

  it('allows 2 submissions within a minute but rate-limits the 3rd (429)', async () => {
    const token = await registerStudent();
    const problem = await Problem.create({
      title: 'RateLimited',
      testCases: [{ input: '2', expectedOutput: '4' }],
    });
    post
      .mockResolvedValueOnce({ data: { stdout: b64('4\n'), status: { id: 3 } } })
      .mockResolvedValueOnce({ data: { stdout: b64('4\n'), status: { id: 3 } } });

    const submit = () =>
      request(app)
        .post('/submissions')
        .set('Authorization', `Bearer ${token}`)
        .send({ problemId: problem._id.toString(), code: 'print(4)', language: 'python' });

    const first = await submit();
    expect(first.status).toBe(202);

    const second = await submit();
    expect(second.status).toBe(202);

    const third = await submit();
    expect(third.status).toBe(429);
    expect(third.body.error).toMatch(/twice per minute/i);
    expect(third.headers['retry-after']).toBeDefined();
    // The 3rd request never reached Judge0 at all.
    expect(post).not.toHaveBeenCalled();
    expect(enqueueSubmission).toHaveBeenCalledTimes(2);
  });
});
