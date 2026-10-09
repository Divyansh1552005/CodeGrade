import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../app.js';
import UserStats from '../../models/UserStats.js';
import Badge from '../../models/Badge.js';
import UserBadge from '../../models/UserBadge.js';
import GamificationEvent from '../../models/GamificationEvent.js';
import Problem from '../../models/Problem.js';
import Submission from '../../models/Submission.js';
import Notification from '../../models/Notification.js';
import { processNotification } from '../../services/notificationProcessor.js';
import WorkItem from '../../models/WorkItem.js';
import { awardSubmission, levelProgress, solveStreak, visibleStreak, projectAwards } from '../../services/gamificationService.js';
import { checkBadges } from '../../services/badgeService.js';
import { recalculateDifficulties, difficultyFromPassRate } from '../../services/difficultyService.js';
import { clearLeaderboardCache } from '../../services/leaderboardService.js';
import { recoverDomainWork } from '../../services/recoveryService.js';

const app = createApp();
let student, other;
const auth = (actor) => `Bearer ${actor.accessToken}`;
async function register(name = 'Student', role = 'student') {
  const response = await request(app).post('/auth/register').send({ name, email: `${Math.random()}@test.com`, password: 'password123', role });
  return response.body;
}
async function solve({ actor = student, difficulty = 'easy', topics = ['Arrays'], problem, date = new Date(), passCount = 1, totalCount = 1, status = 'graded' } = {}) {
  problem ||= await Problem.create({ title: 'Test', difficulty, topics });
  return Submission.create({ studentId: actor.user._id, problemId: problem._id,
    code: 'print(1)', language: 'python', status, passCount, totalCount, createdAt: date, gradedAt: date,
    rewardDifficulty: difficulty, rewardTopics: topics });
}
beforeEach(async () => {
  clearLeaderboardCache();
  await Promise.all([UserStats.init(), Badge.init(), UserBadge.init(), GamificationEvent.init(), WorkItem.init()]);
  student = await register(); other = await register('Other');
});

describe('durable gamification awards', () => {
  it('weights unique solves, calculates level thresholds and snapshots reward difficulty', async () => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const submission = await solve({ difficulty });
      await Problem.updateOne({ _id: submission.problemId }, { $set: { difficulty: 'easy', topics: ['Strings'] } });
      await awardSubmission(submission.id);
    }
    const stats = await UserStats.findOne({ userId: student.user._id }).lean();
    expect(stats.xp).toBe(600); expect(stats.level).toBe(3); expect(stats.solvedCount).toBe(3);
    expect(stats.topicXp).toEqual([{ topic: 'Arrays', xp: 600 }]);
    expect(levelProgress(0)).toEqual({ level: 1, levelStartXp: 0, nextLevelXp: 100, xpIntoLevel: 0, xpForNextLevel: 100 });
    expect(levelProgress(400).level).toBe(3);
  });
  it('deduplicates concurrent retries and never awards extra XP for solving the same problem twice', async () => {
    const submission = await solve({ difficulty: 'hard' });
    await Promise.all([awardSubmission(submission.id), awardSubmission(submission.id)]);
    const repeated = await solve({ difficulty: 'hard', problem: await Problem.findById(submission.problemId) });
    await awardSubmission(repeated.id);
    expect(await GamificationEvent.countDocuments()).toBe(2);
    const stats = await UserStats.findOne({ userId: student.user._id });
    expect(stats.xp).toBe(300); expect(stats.solvedCount).toBe(1);
    expect(await UserBadge.countDocuments({ userId: student.user._id })).toBe(1);
  });
  it('preserves the event and award date across a stats-write failure and retry', async () => {
    const submission = await solve();
    const write = jest.spyOn(UserStats, 'updateOne').mockRejectedValueOnce(new Error('temporary write failure'));
    await expect(awardSubmission(submission.id, new Date('2026-10-01T23:59:00Z'))).rejects.toThrow('temporary write failure');
    write.mockRestore();
    const stats = await awardSubmission(submission.id, new Date('2026-10-03T00:00:00Z'));
    expect(stats.lastSolvedDate.toISOString()).toBe('2026-10-01T23:59:00.000Z');
    expect(stats.xp).toBe(100); expect(await GamificationEvent.countDocuments()).toBe(1);
  });
  it('does not reward failed, zero-test, queued or infrastructure-error submissions', async () => {
    for (const input of [{ passCount: 0 }, { totalCount: 0, passCount: 0 }, { status: 'queued' }, { status: 'error' }]) {
      expect(await awardSubmission((await solve(input)).id)).toBeNull();
    }
    expect(await GamificationEvent.countDocuments()).toBe(0);
  });
  it('counts successful solve days at award time, allows repeat solves for streaks and resets after a gap', async () => {
    const first = await solve();
    await awardSubmission(first.id, new Date('2026-10-01T23:59:00Z'));
    await awardSubmission((await solve()).id, new Date('2026-10-02T00:01:00Z'));
    let stats = await awardSubmission((await solve({ problem: await Problem.findById(first.problemId) })).id, new Date('2026-10-02T20:00:00Z'));
    expect(stats.currentStreak).toBe(2); expect(stats.longestStreak).toBe(2); expect(stats.xp).toBe(200);
    stats = await awardSubmission((await solve()).id, new Date('2026-10-04T00:00:00Z'));
    expect(stats.currentStreak).toBe(1); expect(stats.longestStreak).toBe(2);
    expect(visibleStreak(stats, new Date('2026-10-06T00:00:00Z'))).toBe(0);
    expect(solveStreak('2026-10-01T12:00:00Z', 5, new Date('2026-10-02T00:00:00Z'))).toBe(6);
  });
  it('unlocks catalog rules independently and retains one badge per user across replays', async () => {
    for (let day = 1; day <= 7; day++) {
      await awardSubmission((await solve({ difficulty: 'hard' })).id, new Date(`2026-10-0${day}T12:00:00Z`));
    }
    await checkBadges(student.user._id, { type: 'solve', awardedAt: new Date() });
    const earned = await UserBadge.find({ userId: student.user._id }).populate('badgeId');
    expect(earned.map((entry) => entry.badgeId.key).sort()).toEqual(['first-solve', 'five-solves', 'level-five', 'seven-day-streak'].sort());
    expect(await checkBadges(student.user._id, { type: 'unrelated' })).toEqual([]);
  });
  it('repairs old completed submissions via the durable completion queue', async () => {
    const submission = await solve();
    await Submission.updateOne({ _id: submission.id }, { $set: { completionRecordedAt: new Date() } });
    await recoverDomainWork(); await recoverDomainWork();
    expect(await WorkItem.countDocuments({ key: `gamification-${submission.id}`, type: 'completion' })).toBe(1);
  });
  it('projects concurrent distinct solves without losing XP', async () => {
    const submissions = await Promise.all([solve({ difficulty: 'medium' }), solve({ difficulty: 'hard' })]);
    await Promise.all(submissions.map((submission) => awardSubmission(submission.id)));
    await projectAwards(student.user._id);
    expect((await UserStats.findOne({ userId: student.user._id })).xp).toBe(500);
  });
});

describe('leaderboard and progress APIs', () => {
  it('returns own XP bar and badge shelf and ranks global/topic scores without exposing emails', async () => {
    await awardSubmission((await solve({ difficulty: 'hard' })).id);
    await awardSubmission((await solve({ actor: other, difficulty: 'medium', topics: ['Strings'] })).id);
    const progress = await request(app).get('/activity/progress').set('Authorization', auth(student));
    expect(progress.body.progress.xp).toBe(300); expect(progress.body.progress.level).toBe(2);
    expect(progress.body.progress.badges[0].key).toBe('first-solve');
    const global = await request(app).get('/leaderboard?scope=global').set('Authorization', auth(student));
    expect(global.body.entries.map((entry) => entry.xp)).toEqual([300, 200]);
    expect(global.body.entries[0].userId.email).toBeUndefined();
    const topic = await request(app).get('/leaderboard?scope=topic&topic=Strings').set('Authorization', auth(student));
    expect(topic.body.entries.map((entry) => entry.userId.name)).toEqual(['Other']);
  });
  it('suppresses queued grading alerts and hides legacy grading notifications', async () => {
    const submission = await solve();
    await processNotification({ data: { submissionId: submission.id } });
    expect(await Notification.countDocuments()).toBe(0);
    const legacy = await Notification.create({ key: `submission-${submission.id}`, userId: student.user._id, message: 'Grading complete', href: '/submit/old' });
    const answerNotice = await Notification.create({ key: 'answer-approved', userId: student.user._id, message: 'Approved answer', href: '/doubts/current' });
    const response = await request(app).get('/activity/notifications').set('Authorization', auth(student));
    expect(response.body.notifications.map((notice) => notice._id)).toEqual([answerNotice.id]);
    expect((await request(app).patch(`/activity/notifications/${legacy.id}/read`).set('Authorization', auth(student))).status).toBe(404);
  });
  it('validates scope/topic, requires auth and caches a ranking for 30 seconds', async () => {
    expect((await request(app).get('/leaderboard')).status).toBe(401);
    for (const query of ['scope=weekly', 'scope=topic', 'scope=topic&topic=bad']) {
      expect((await request(app).get(`/leaderboard?${query}`).set('Authorization', auth(student))).status).toBe(400);
    }
    await awardSubmission((await solve()).id);
    const query = () => request(app).get('/leaderboard').set('Authorization', auth(student));
    expect((await query()).body.entries[0].xp).toBe(100);
    await awardSubmission((await solve({ difficulty: 'hard' })).id);
    expect((await query()).body.entries[0].xp).toBe(100);
    clearLeaderboardCache(); expect((await query()).body.entries[0].xp).toBe(400);
  });
});

describe('pass-rate difficulty recalculation', () => {
  it('keeps small samples unchanged and applies pass-rate thresholds', async () => {
    const problem = await Problem.create({ title: 'Hard initially', difficulty: 'hard' });
    await solve({ problem }); await recalculateDifficulties();
    let updated = await Problem.findById(problem.id);
    expect(updated.difficulty).toBe('hard'); expect(updated.difficultySampleSize).toBe(1);
    for (let i = 0; i < 9; i++) await solve({ actor: { user: { _id: new mongoose.Types.ObjectId() } }, problem });
    await recalculateDifficulties(); updated = await Problem.findById(problem.id);
    expect(updated.difficulty).toBe('easy'); expect(updated.passRate).toBe(1);
    expect(difficultyFromPassRate(0.7)).toBe('easy'); expect(difficultyFromPassRate(0.3)).toBe('medium'); expect(difficultyFromPassRate(0.29)).toBe('hard');
  });
  it('counts only the latest graded attempt per student and excludes zero-test/errors', async () => {
    const problem = await Problem.create({ title: 'Sample', difficulty: 'medium' });
    await solve({ problem, date: new Date('2026-10-01'), passCount: 0 });
    await solve({ problem, date: new Date('2026-10-02') });
    await solve({ problem, status: 'error', date: new Date('2026-10-03') });
    await solve({ actor: other, problem, totalCount: 0, passCount: 0 });
    await recalculateDifficulties();
    const updated = await Problem.findById(problem.id);
    expect(updated.difficultySampleSize).toBe(1); expect(updated.passRate).toBe(1); expect(updated.difficulty).toBe('medium');
  });
});
