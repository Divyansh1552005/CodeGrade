/** Real API + separate worker + hosted Redis/Judge0/AI, isolated from app data.
 * Run npm run test:smoke; uses a temporary MongoDB and unique Redis namespace.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_NAMES } from '../services/queueRuntime.js';
import WorkItem from '../models/WorkItem.js';
import Submission from '../models/Submission.js';
import Answer from '../models/Answer.js';
import Problem from '../models/Problem.js';
import User from '../models/User.js';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
assert(process.env.REDIS_URL, 'REDIS_URL is required');
const prefix = `smoke-${randomUUID()}`;
const results = [];
const actorIds = [];
const diagnostics = {};
const children = new Set();
const queues = [];
let mongo, redis, worker, apiProcess, baseURL;
let childEnv;
const logs = [];
function sanitize(text) {
  let output = text;
  for (const key of ['REDIS_URL', 'MONGODB_URI', 'GOOGLE_API_KEY', 'GROQ_API_KEY', 'JUDGE0_API_KEY', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = process.env[key];
    if (value) output = output.split(value).join('[redacted]');
  }
  return output;
}
function child(file) {
  const process = spawn(globalThis.process.execPath, [file], { cwd: serverDir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.on('data', (data) => logs.push(sanitize(data.toString())));
  process.stderr.on('data', (data) => logs.push(sanitize(data.toString())));
  process.on('error', (err) => logs.push(sanitize(err.message)));
  children.add(process);
  return process;
}
async function stop(process) {
  if (!process || process.exitCode !== null || process.signalCode !== null) return;
  const closed = once(process, 'exit');
  process.kill('SIGTERM');
  const timer = setTimeout(() => process.kill('SIGKILL'), 10000);
  await closed;
  clearTimeout(timer);
}
async function waitFor(label, check, timeout = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    if (apiProcess && (apiProcess.exitCode !== null || apiProcess.signalCode !== null)) throw new Error('API exited during smoke check');
    if (worker && (worker.exitCode !== null || worker.signalCode !== null)) throw new Error('Worker exited during smoke check');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out: ${label}`);
}
async function check(label, run) {
  const started = Date.now();
  try {
    await run();
    results.push({ label, passed: true, durationMs: Date.now() - started });
    console.log(`PASS ${label}`);
  } catch (err) {
    results.push({ label, passed: false, error: sanitize(err.message), durationMs: Date.now() - started });
    console.error(`FAIL ${label}: ${sanitize(err.message)}`);
  }
}
async function request(path, { actor, method = 'GET', body, expected = 200 } = {}) {
  const res = await fetch(`${baseURL}${path}`, { method, signal: AbortSignal.timeout(15000), headers: {
    'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.accessToken}` } : {}),
  }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = res.status === 204 ? {} : await res.json();
  assert.equal(res.status, expected, `${method} ${path}: expected ${expected}, got ${res.status}: ${data.error || ''}`);
  return data;
}
async function register(role) {
  const actor = await request('/auth/register', { method: 'POST', expected: 201,
    body: { name: `Smoke ${role}`, email: `${role}-${randomUUID()}@example.test`, password: randomUUID() } });
  // Public signup always makes a student; the smoke teacher is promoted directly in the temporary database.
  if (role !== 'student') await User.updateOne({ _id: actor.user._id }, { $set: { role } });
  actorIds.push(actor.user._id);
  return actor;
}
async function terminalSubmission(id, actor) {
  return waitFor('submission grading', async () => {
    const { submission } = await request(`/submissions/${id}`, { actor });
    return ['graded', 'error'].includes(submission.status) && submission;
  });
}
async function terminalJob(id, actor) {
  return waitFor('bulk job', async () => {
    const { job } = await request(`/jobs/${id}`, { actor });
    return ['completed', 'failed'].includes(job.status) && job;
  });
}

try {
  redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 10000, retryStrategy: () => null });
  redis.on('error', () => {});
  await redis.connect();
  assert.equal(await redis.ping(), 'PONG');
  diagnostics.redisEvictionPolicy = (await redis.info('memory')).match(/^maxmemory_policy:(.+)$/m)?.[1]?.trim() || 'unknown';
  console.log('Hosted Redis connected; using isolated smoke namespace.');
  if (diagnostics.redisEvictionPolicy !== 'noeviction') console.warn(`Redis production setting: maxmemory-policy=${diagnostics.redisEvictionPolicy}; BullMQ requires noeviction.`);
  for (const name of [...new Set([...Object.values(QUEUE_NAMES), 'queue-maintenance'])]) {
    const queue = new Queue(name, { connection: redis, prefix });
    queue.on('error', () => {});
    queues.push(queue);
  }
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const portServer = createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
  const port = portServer.address().port; await new Promise((resolve) => portServer.close(resolve));
  childEnv = { ...process.env, NODE_ENV: 'development', RATE_LIMIT_PREFIX: prefix, PORT: String(port), MONGODB_URI: mongo.getUri(), QUEUE_PREFIX: prefix,
    JWT_ACCESS_SECRET: randomUUID(), JWT_REFRESH_SECRET: randomUUID(), CLIENT_ORIGIN: '' };
  baseURL = `http://127.0.0.1:${port}`;
  apiProcess = child('server.js');
  await waitFor('API boot', async () => { try { return (await fetch(`${baseURL}/health`)).ok; } catch { return false; } }, 20000);
  const student = await register('student');
  const otherStudent = await register('student');
  const teacher = await register('teacher');
  const otherTeacher = await register('teacher');
  const definition = { title: 'Smoke Echo', description: 'Print the input number.', inputFormat: 'One integer.', outputFormat: 'The same integer.',
    constraints: '1 <= n <= 10', difficulty: 'medium', topics: ['Arrays'], sampleCases: [{ input: '7', output: '7' }], testCases: [{ input: '7', expectedOutput: '7' }] };
  const { problem } = await request('/problems', { actor: teacher, method: 'POST', body: definition, expected: 201 });
  let submissionId;
  await check('API accepts queued grading while worker is stopped', async () => {
    const accepted = await request('/submissions', { actor: student, method: 'POST', expected: 202,
      body: { problemId: problem._id, language: 'python', code: 'print(input())' } });
    submissionId = accepted.submissionId;
    assert.equal(accepted.submission.status, 'queued');
    assert.equal(accepted.submission.testCasesSnapshot, undefined);
    assert.equal((await WorkItem.findOne({ key: `grading-${submissionId}` })).status, 'pending');
  });
  assert(submissionId, 'Submission acceptance must pass before worker checks');
  worker = child('worker.js');
  const graded = await terminalSubmission(submissionId, student);
  await check('Real Judge0 grading through hosted Redis and separate worker', async () => {
    assert.equal(graded.status, 'graded', graded.error || 'Grading did not finish');
    assert.equal(graded.passCount, 1); assert.equal(graded.totalCount, 1);
  });
  await check('Real AI feedback completes independently', async () => {
    assert.equal(graded.status, 'graded', graded.error || 'No graded submission');
    const done = await waitFor('AI feedback', async () => {
      const { submission } = await request(`/submissions/${submissionId}`, { actor: student });
      return ['completed', 'failed'].includes(submission.feedbackStatus) && submission;
    }, 180000);
    assert.equal(done.feedbackStatus, 'completed', done.feedbackError || 'AI feedback failed');
    assert(done.aiFeedback?.summary, 'Feedback summary missing');
  });
  await check('Analytics, weighted XP, level, streak and badge without grading notifications', async () => {
    assert.equal(graded.status, 'graded', graded.error || 'No graded submission');
    const progress = await waitFor('completion projection', async () => {
      const { progress } = await request('/activity/progress', { actor: student });
      return progress.xp === 200 && progress.badges?.some((badge) => badge.key === 'first-solve') && progress;
    });
    assert.equal(progress.solvedCount, 1); assert.equal(progress.currentStreak, 1);
    assert(progress.achievements.includes('first-solve'));
    assert.equal(progress.level, 2); assert.equal(progress.xpIntoLevel, 100); assert.equal(progress.xpForNextLevel, 300);
    const topic = await request('/leaderboard?scope=topic&topic=Arrays', { actor: student });
    assert(topic.entries.some((entry) => String(entry.userId._id) === String(student.user._id) && entry.xp === 200));
    assert.equal((await request('/activity/notifications', { actor: student })).notifications.length, 0);
    assert.equal(await WorkItem.countDocuments({ key: `submission-notification-${submissionId}` }), 0);
    const { entries } = await request('/activity/leaderboard', { actor: student });
    assert(entries.some((e) => String(e.studentId._id) === String(student.user._id) && e.xp === 200));
  });
  await check('Real AI doubt draft stays hidden until teacher approval', async () => {
    const { doubt } = await request('/doubts', { actor: student, method: 'POST', expected: 201,
      body: { title: 'Python loop question', body: 'How do I iterate over the numbers 1 to 3 using a Python for loop?' } });
    const answer = await waitFor('AI doubt draft', async () => {
      const record = await Answer.findOne({ doubtId: doubt._id });
      if (record) return record;
      const failed = await WorkItem.findOne({ key: `draft-${doubt._id}`, status: 'failed' });
      if (failed) throw new Error(failed.error);
      return false;
    }, 180000);
    assert.equal(answer.state, 'pending'); assert.equal(answer.source, 'ai');
    const hidden = await request(`/doubts/${doubt._id}/answer`, { actor: student }); assert.equal(hidden.answer, null);
    await request(`/answers/${answer.id}/approve`, { actor: teacher, method: 'PATCH', body: {} });
    assert.equal((await request(`/doubts/${doubt._id}/answer`, { actor: student })).answer.state, 'approved');
    const notice = await waitFor('answer notification', async () => {
      const { notifications } = await request('/activity/notifications', { actor: student });
      return notifications.find((n) => n.href === `/doubts/${doubt._id}`);
    });
    await request(`/activity/notifications/${notice._id}/read`, { actor: otherStudent, method: 'PATCH', expected: 404 });
    await request(`/activity/notifications/${notice._id}/read`, { actor: student, method: 'PATCH' });
  });
  await check('Teacher import/export/report jobs through real Redis', async () => {
    const started = await request('/jobs', { actor: teacher, method: 'POST', expected: 202,
      body: { type: 'problem-import', problems: [{ ...definition, title: 'Imported Smoke Echo' }] } });
    const imported = await terminalJob(started.job._id, teacher);
    assert.equal(imported.status, 'completed', imported.error); assert.equal(imported.result.importedCount, 1);
    await request(`/jobs/${started.job._id}`, { actor: otherTeacher, expected: 404 });
    await request('/jobs', { actor: student, method: 'POST', body: { type: 'problem-export' }, expected: 403 });
    await request('/problems', { actor: otherTeacher, method: 'POST', body: { ...definition, title: 'Other teacher problem' }, expected: 201 });
    for (const type of ['problem-export', 'report-export']) {
      const accepted = await request('/jobs', { actor: teacher, method: 'POST', body: { type }, expected: 202 });
      const done = await terminalJob(accepted.job._id, teacher);
      assert.equal(done.status, 'completed', done.error); assert.equal(done.result.problems.length, 2);
      assert(!done.result.problems.some((p) => p.title === 'Other teacher problem'));
      if (type === 'report-export') {
        const row = done.result.problems.find((p) => String(p.problemId) === problem._id);
        assert.equal(row.submissions, 1); assert.equal(row.graded, graded.status === 'graded' ? 1 : 0);
      }
    }
  });
  await check('Scheduled difficulty job updates pass rate without changing awarded XP', async () => {
    const maintenance = queues.find((queue) => queue.name === 'queue-maintenance');
    assert(await maintenance.getJobScheduler('recalculate-difficulty'), 'Hourly difficulty scheduler missing');
    await Submission.insertMany(Array.from({ length: 9 }, () => ({
      studentId: new mongoose.Types.ObjectId(), problemId: problem._id, code: 'print(7)', language: 'python',
      status: 'graded', passCount: 1, totalCount: 1, completionRecordedAt: new Date(), gamificationRecordedAt: new Date(),
    })));
    const job = await maintenance.add('difficulty', {}, { attempts: 3, removeOnComplete: 10 });
    await waitFor('difficulty recalculation', async () => {
      const updated = await Problem.findById(problem._id);
      return updated.difficultySampleSize === 10 && updated.difficulty === 'easy' && (await job.getState()) === 'completed';
    });
    const { progress } = await request('/activity/progress', { actor: student });
    assert.equal(progress.xp, 200, 'Existing XP changed after difficulty recalculation');
  });
  await check('Worker restart reconstructs a missing outbox record', async () => {
    await stop(worker); worker = undefined;
    // Startup recovery must detect a domain document saved without its outbox.
    const missing = await Submission.create({ studentId: otherStudent.user._id, problemId: problem._id,
      language: 'python', code: 'print(input())', testCasesSnapshot: definition.testCases });
    worker = child('worker.js');
    const recovered = await terminalSubmission(missing.id, otherStudent);
    assert.equal(recovered.status, 'graded', recovered.error); assert.equal(recovered.passCount, 1);
    assert(await WorkItem.exists({ key: `grading-${missing.id}` }));
  });
  await check('Rate limits and submission ownership remain enforced', async () => {
    await request(`/submissions/${submissionId}`, { actor: otherStudent, expected: 403 });
    await request('/submissions', { actor: teacher, method: 'POST', expected: 403,
      body: { problemId: problem._id, language: 'python', code: 'x' } });
    await stop(worker); worker = undefined;
    const limitedStudent = await register('student');
    for (let i = 0; i < 2; i++) {
      await request('/submissions', { actor: limitedStudent, method: 'POST', expected: 202,
        body: { problemId: problem._id, language: 'python', code: 'print(input())' } });
    }
    await request('/submissions', { actor: limitedStudent, method: 'POST', expected: 429,
      body: { problemId: problem._id, language: 'python', code: 'print(input())' } });
    assert.equal(await redis.exists(`${prefix}:rl:submit:min:${limitedStudent.user._id}`), 1,
      'Redis minute limiter must be used, not the memory insurance fallback');
  });
} catch (err) {
  results.push({ label: 'Smoke setup/execution', passed: false, error: sanitize(err.message) });
  console.error(sanitize(err.message));
} finally {
  // Stop only children started by this script, then clear only its unique prefix.
  for (const process of children) await stop(process);
  if (redis?.status === 'ready') {
    assert(prefix.startsWith('smoke-'));
    for (const queue of queues) {
      await queue.obliterate({ force: true }).catch((err) => console.error(`Smoke namespace cleanup failed: ${sanitize(err.message)}`));
      await queue.close().catch(() => {});
    }
    for (const id of actorIds) {
      await redis.del(`${prefix}:rl:general:${id}`, `${prefix}:rl:submit:min:${id}`, `${prefix}:rl:submit:day:${id}`);
    }
    await redis.quit();
  } else redis?.disconnect();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  await writeFile('/tmp/codegrade-smoke-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), diagnostics, results }, null, 2));
  const failed = results.filter((r) => !r.passed);
  console.log(`Smoke checks: ${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    console.error('Recent worker output:\n' + logs.slice(-15).join('').slice(-12000));
    process.exitCode = 1;
  }
}
