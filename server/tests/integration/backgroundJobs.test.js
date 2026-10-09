import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';

const svc = (name) => new URL(`../../services/${name}`, import.meta.url).pathname;
const draft = jest.fn();
class NotRelevantError extends Error {}
jest.unstable_mockModule(svc('doubtDraftChain.js'), () => ({ generateDraftAnswer: draft, NotRelevantError }));
const grade = jest.fn();
jest.unstable_mockModule(svc('gradingService.js'), () => ({ gradeSubmission: grade }));
const feedback = jest.fn();
jest.unstable_mockModule(svc('aiFeedbackChain.js'), () => ({ generateFeedback: feedback }));
const { createApp } = await import('../../app.js');
const User = (await import('../../models/User.js')).default;
const Problem = (await import('../../models/Problem.js')).default;
const Submission = (await import('../../models/Submission.js')).default;
const Doubt = (await import('../../models/Doubt.js')).default;
const Answer = (await import('../../models/Answer.js')).default;
const WorkItem = (await import('../../models/WorkItem.js')).default;
const UserStats = (await import('../../models/UserStats.js')).default;
const UserBadge = (await import('../../models/UserBadge.js')).default;
const { awardSubmission } = await import('../../services/gamificationService.js');
const StudentStats = (await import('../../models/StudentStats.js')).default;
const Notification = (await import('../../models/Notification.js')).default;
const { ensureWork } = await import('../../services/workService.js');
const { processWork } = await import('../../services/workProcessor.js');
const { dispatchWork, recoverDomainWork } = await import('../../services/recoveryService.js');
const { processDoubtDraft } = await import('../../services/doubtProcessor.js');
const { processBulk } = await import('../../services/bulkProcessor.js');
const { processNotification } = await import('../../services/notificationProcessor.js');
const { streaks, rebuildStudentStats } = await import('../../services/progressService.js');
const app = createApp();
let student, teacher, otherTeacher;
async function register(role) {
  const res = await request(app).post('/auth/register').send({ name: role, email: `${Math.random()}@x.com`, password: 'password123', role });
  return { user: res.body.user, token: res.body.accessToken };
}
const auth = (actor) => `Bearer ${actor.token}`;
const run = (work, attemptsMade = 0, attempts = 3) => processWork({ data: { workItemId: work.id }, attemptsMade, opts: { attempts } });
const problemInput = { title: 'Echo', description: 'Echo input', inputFormat: 'One number', outputFormat: 'One number',
  constraints: 'n <= 10', topics: ['Arrays'], sampleCases: [{ input: '1', output: '1' }], testCases: [{ input: '1', expectedOutput: '1' }] };
beforeEach(async () => {
  await Promise.all([WorkItem.init(), Answer.init(), Problem.init(), StudentStats.init(), Notification.init()]);
  student = await register('student'); teacher = await register('teacher'); otherTeacher = await register('teacher');
  draft.mockReset().mockResolvedValue({ draftAnswer: 'Use a loop.' });
  grade.mockReset().mockResolvedValue({ testResults: [{ input: '1', expectedOutput: '1', actualOutput: '1', passed: true }], passCount: 1, totalCount: 1 });
  feedback.mockReset().mockResolvedValue({ summary: 'Good', strengths: [], improvements: [], complexityNote: 'O(n)' });
});

describe('durable drafts and retries', () => {
  it('accepts a doubt without calling AI or needing Redis, then creates one draft on duplicate delivery', async () => {
    const res = await request(app).post('/doubts').set('Authorization', auth(student)).send({ title: 'Loop', body: 'How do loops work?' });
    expect(res.status).toBe(201);
    expect(draft).not.toHaveBeenCalled();
    const work = await WorkItem.findOne({ key: `draft-${res.body.doubt._id}` });
    expect(work.status).toBe('pending');
    await run(work); await run(work);
    expect(await Answer.countDocuments({ doubtId: res.body.doubt._id })).toBe(1);
    expect(draft).toHaveBeenCalledTimes(1);
  });
  it('uses a unique generation key under concurrent draft processing', async () => {
    const doubt = await Doubt.create({ studentId: student.user._id, title: 'P', body: 'Question' });
    await Promise.all([processDoubtDraft({ data: { doubtId: doubt.id } }), processDoubtDraft({ data: { doubtId: doubt.id } })]);
    expect(await Answer.countDocuments({ doubtId: doubt.id, source: 'ai' })).toBe(1);
  });
  it('keeps a teacher answer saved while an AI request fails', async () => {
    const doubt = await Doubt.create({ studentId: student.user._id, title: 'P', body: 'Question' });
    let rejectAI;
    const waiting = new Promise((_, reject) => { rejectAI = reject; });
    draft.mockImplementationOnce(() => waiting);
    const work = await ensureWork({ key: 'draft', type: 'doubt-draft', ownerId: student.user._id, payload: { doubtId: doubt.id } });
    const processing = run(work, 2);
    // Wait for the processor to actually call the model before inserting.
    while (!draft.mock.calls.length) await new Promise((r) => setTimeout(r, 5));
    const answer = await Answer.create({ doubtId: doubt.id, source: 'teacher', state: 'pending', content: 'Teacher answer' });
    rejectAI(new Error('AI outage'));
    await expect(processing).rejects.toThrow('AI outage');
    expect((await Answer.findById(answer.id)).content).toBe('Teacher answer');
  });
  it('keeps draft pending while retryable, marks failed on exhaustion, and treats off-topic as terminal', async () => {
    const doubt = await Doubt.create({ studentId: student.user._id, title: 'P', body: 'Question' });
    const work = await ensureWork({ key: 'draft', type: 'doubt-draft', ownerId: student.user._id, payload: { doubtId: doubt.id } });
    draft.mockRejectedValue(new Error('outage'));
    await expect(run(work)).rejects.toThrow('outage');
    expect((await Doubt.findById(doubt.id)).aiDraftStatus).toBe('pending');
    await expect(run(work, 2)).rejects.toThrow('outage');
    expect((await Doubt.findById(doubt.id)).aiDraftStatus).toBe('failed');
    const offTopic = await Doubt.create({ studentId: student.user._id, title: 'Food', body: 'Recipe' });
    const other = await ensureWork({ key: 'other', type: 'doubt-draft', ownerId: student.user._id, payload: { doubtId: offTopic.id } });
    draft.mockRejectedValue(new NotRelevantError());
    await run(other);
    expect((await Doubt.findById(offTopic.id)).aiDraftStatus).toBe('irrelevant');
    expect((await WorkItem.findById(other.id)).status).toBe('completed');
  });
});

describe('grading, independent feedback and completion', () => {
  it('returns 202 with a durable job and hides its snapshot', async () => {
    const problem = await Problem.create({ ...problemInput, createdBy: teacher.user._id });
    const res = await request(app).post('/submissions').set('Authorization', auth(student))
      .send({ problemId: problem.id, language: 'python', code: 'print(input())' });
    expect(res.status).toBe(202);
    expect(res.body.submission.testCasesSnapshot).toBeUndefined();
    expect((await WorkItem.findOne({ key: `grading-${res.body.submissionId}` })).status).toBe('pending');
    expect(grade).not.toHaveBeenCalled();
    const detail = await request(app).get(`/submissions/${res.body.submissionId}`).set('Authorization', auth(student));
    expect(detail.body.submission.testCasesSnapshot).toBeUndefined();
  });
  it('recovers a missing grading job using the original cases and independently retries feedback', async () => {
    const problem = await Problem.create(problemInput);
    const submission = await Submission.create({ studentId: student.user._id, problemId: problem.id, language: 'python', code: 'x', testCasesSnapshot: problemInput.testCases });
    await Problem.updateOne({ _id: problem.id }, { $set: { testCases: [{ input: '2', expectedOutput: 'new' }] } });
    await recoverDomainWork(); await recoverDomainWork();
    const work = await WorkItem.findOne({ key: `grading-${submission.id}` });
    await run(work);
    expect(grade.mock.calls[0][0].testCases[0].expectedOutput).toBe('1');
    expect(feedback).not.toHaveBeenCalled();
    expect((await Submission.findById(submission.id)).status).toBe('graded');
    const feedbackWork = await WorkItem.findOne({ key: `feedback-${submission.id}` });
    feedback.mockRejectedValueOnce(new Error('provider down'));
    await expect(run(feedbackWork)).rejects.toThrow('provider down');
    expect((await Submission.findById(submission.id)).status).toBe('graded');
    await run(feedbackWork, 1);
    expect((await Submission.findById(submission.id)).feedbackStatus).toBe('completed');
    await run(work);
    expect(grade).toHaveBeenCalledTimes(1);
  });
  it('rebuilds analytics and awards unique-solve XP without grading notifications', async () => {
    const problem = await Problem.create(problemInput);
    const a = await Submission.create({ studentId: student.user._id, problemId: problem.id, language: 'python', code: 'x', status: 'graded', passCount: 1, totalCount: 1 });
    const b = await Submission.create({ studentId: student.user._id, problemId: problem.id, language: 'python', code: 'x', status: 'graded', passCount: 1, totalCount: 1 });
    await recoverDomainWork();
    for (const sub of [a, b]) {
      const completion = await WorkItem.findOne({ key: `completion-${sub.id}` });
      await run(completion); await run(completion);
      expect(await WorkItem.findOne({ key: `submission-notification-${sub.id}` })).toBeNull();
    }
    const stats = await StudentStats.findOne({ studentId: student.user._id });
    expect(stats.submissionCount).toBe(2); expect(stats.solvedCount).toBe(1);
    expect((await UserStats.findOne({ userId: student.user._id })).xp).toBe(100);
    expect(await UserBadge.countDocuments({ userId: student.user._id })).toBe(1);
    expect(await Notification.countDocuments({ userId: student.user._id })).toBe(0);
    const res = await request(app).get('/activity/progress').set('Authorization', auth(student));
    expect(res.body.progress.xp).toBe(100);
    const leaderboard = await request(app).get('/activity/leaderboard').set('Authorization', auth(student));
    expect(leaderboard.body.entries[0].studentId.name).toBe('student');
    expect(leaderboard.body.entries[0].studentId.email).toBeUndefined();
  });
  it('unlocks solve and streak achievements while excluding zero-test and failing submissions', async () => {
    const now = new Date();
    const rows = Array.from({ length: 10 }, (_, index) => ({
      studentId: student.user._id, problemId: new mongoose.Types.ObjectId(), language: 'python', code: 'x',
      status: 'graded', passCount: 1, totalCount: 1, createdAt: new Date(now.getTime() - index * 86400000),
    }));
    const submissions = await Submission.insertMany([...rows,
      { ...rows[0], problemId: new mongoose.Types.ObjectId(), passCount: 0, totalCount: 0 },
      { ...rows[0], problemId: new mongoose.Types.ObjectId(), passCount: 0, totalCount: 1 }]);
    for (const submission of submissions) await awardSubmission(submission.id, submission.createdAt);
    const stats = await rebuildStudentStats(student.user._id);
    const awards = await UserStats.findOne({ userId: student.user._id });
    expect(awards.xp).toBe(1000);
    expect(stats.solvedCount).toBe(10);
    expect(stats.submissionCount).toBe(12);
    expect(awards.longestStreak).toBe(10);
    const badges = await UserBadge.find({ userId: student.user._id }).populate('badgeId');
    expect(badges.map((entry) => entry.badgeId.key).sort()).toEqual(['first-solve', 'five-solves', 'ten-solves', 'seven-day-streak'].sort());
  });
  it('calculates UTC streaks across duplicates, missing days and a stale last day', () => {
    expect(streaks(['2026-10-07', '2026-10-08', '2026-10-08', '2026-10-09'], new Date('2026-10-10T10:00:00Z'))).toEqual({ longestStreak: 3, currentStreak: 3 });
    expect(streaks(['2026-10-07', '2026-10-08', '2026-10-10'], new Date('2026-10-11T10:00:00Z'))).toEqual({ longestStreak: 2, currentStreak: 1 });
    expect(streaks(['2026-10-07'], new Date('2026-10-10T10:00:00Z')).currentStreak).toBe(0);
  });
});

describe('outbox dispatcher safety', () => {
  it('does not re-enqueue active work regardless of age', async () => {
    const work = await ensureWork({ key: 'active', type: 'feedback', ownerId: student.user._id, payload: {} });
    const queue = { getJob: jest.fn(async () => ({ getState: async () => 'active' })), add: jest.fn() };
    await dispatchWork(work, queue);
    expect(queue.add).not.toHaveBeenCalled();
  });
  it('restores jobs lost from Redis with stable IDs and preserves a consumer that already started', async () => {
    const work = await ensureWork({ key: 'missing', type: 'notification', ownerId: student.user._id, payload: {} });
    const queue = { getJob: jest.fn(async () => null), add: jest.fn(async () => {
      await WorkItem.updateOne({ _id: work.id }, { $set: { status: 'running' } });
    }) };
    await dispatchWork(work, queue);
    expect(queue.add.mock.calls[0][2].jobId).toBe(work.id);
    expect((await WorkItem.findById(work.id)).status).toBe('running');
  });
  it('preserves the durable attempt budget when Redis loses a job', async () => {
    const work = await ensureWork({ key: 'retries', type: 'notification', ownerId: student.user._id, payload: {} });
    await WorkItem.updateOne({ _id: work.id }, { $set: { attempts: 2 } });
    const queue = { getJob: async () => null, add: jest.fn(async () => {}) };
    await dispatchWork(await WorkItem.findById(work.id), queue);
    expect(queue.add.mock.calls[0][2].attempts).toBe(1);
    await WorkItem.updateOne({ _id: work.id }, { $set: { attempts: 3, status: 'pending' } });
    await dispatchWork(await WorkItem.findById(work.id), queue);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect((await WorkItem.findById(work.id)).status).toBe('failed');
  });
  it('records an exhausted/stalled queue failure instead of automatically retrying it forever', async () => {
    const doubt = await Doubt.create({ studentId: student.user._id, title: 'P', body: 'Q' });
    const work = await ensureWork({ key: 'failed', type: 'doubt-draft', ownerId: student.user._id, payload: { doubtId: doubt.id } });
    const queue = { getJob: async () => ({ getState: async () => 'failed', failedReason: 'stalled too often' }), add: jest.fn() };
    await dispatchWork(work, queue);
    expect((await WorkItem.findById(work.id)).status).toBe('failed');
    expect((await Doubt.findById(doubt.id)).aiDraftStatus).toBe('failed');
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('notifications and bulk jobs permissions', () => {
  it('queues approval notifications and restricts read markers to the recipient', async () => {
    const doubt = await Doubt.create({ studentId: student.user._id, title: 'P', body: 'Q' });
    const answer = await Answer.create({ doubtId: doubt.id, content: 'Answer', source: 'ai', state: 'pending' });
    const res = await request(app).patch(`/answers/${answer.id}/approve`).set('Authorization', auth(teacher)).send({});
    expect(res.status).toBe(200);
    const work = await WorkItem.findOne({ key: `answer-notification-${answer.id}` });
    await run(work); await run(work);
    const notice = await Notification.findOne({ userId: student.user._id });
    const forbidden = await request(app).patch(`/activity/notifications/${notice.id}/read`).set('Authorization', auth(teacher));
    expect(forbidden.status).toBe(404);
    const own = await request(app).patch(`/activity/notifications/${notice.id}/read`).set('Authorization', auth(student));
    expect(own.status).toBe(200);
    expect(own.body.notification.readAt).toBeTruthy();
    await processNotification({ data: { answerId: answer.id } });
    expect(await Notification.countDocuments({ key: `answer-${answer.id}` })).toBe(1);
    expect((await Notification.findById(notice.id)).readAt.toISOString()).toBe(own.body.notification.readAt);
  });
  it('validates all imported rows before queueing and enforces teacher role', async () => {
    const bad = await request(app).post('/jobs').set('Authorization', auth(teacher))
      .send({ type: 'problem-import', problems: [problemInput, { title: 'bad' }] });
    expect(bad.status).toBe(400); expect(await WorkItem.countDocuments()).toBe(0);
    const forbidden = await request(app).post('/jobs').set('Authorization', auth(student)).send({ type: 'problem-export' });
    expect(forbidden.status).toBe(403);
  });
  it('imports idempotently, exposes job status only to its owner and exports only owned problems', async () => {
    const res = await request(app).post('/jobs').set('Authorization', auth(teacher))
      .send({ type: 'problem-import', problems: [problemInput, { ...problemInput, title: 'Second' }] });
    expect(res.status).toBe(202);
    const work = await WorkItem.findById(res.body.job._id);
    await run(work);
    // Simulate a replay after writes but before the work completion commit.
    await processBulk(work);
    expect(await Problem.countDocuments({ createdBy: teacher.user._id })).toBe(2);
    const forbidden = await request(app).get(`/jobs/${work.id}`).set('Authorization', auth(otherTeacher));
    expect(forbidden.status).toBe(404);
    const visible = await request(app).get(`/jobs/${work.id}`).set('Authorization', auth(teacher));
    expect(visible.body.job.payload).toBeUndefined();
    expect(visible.body.job.result.importedCount).toBe(2);
    await Problem.create({ ...problemInput, title: 'Other teacher', createdBy: otherTeacher.user._id });
    const exportWork = await ensureWork({ key: 'export', type: 'problem-export', ownerId: teacher.user._id, payload: {} });
    await run(exportWork);
    const exported = await WorkItem.findById(exportWork.id);
    expect(exported.result.problems).toHaveLength(2);
    expect(exported.result.problems.map((p) => p.title)).not.toContain('Other teacher');
    const report = await ensureWork({ key: 'report', type: 'report-export', ownerId: teacher.user._id, payload: {} });
    await run(report);
    expect((await WorkItem.findById(report.id)).result.problems).toHaveLength(2);
  });
});
