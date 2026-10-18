import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { AIMessage } from '@langchain/core/messages';
import { createApp } from '../../app.js';
import { __setModelForTest } from '../../services/llm.js';
import Problem from '../../models/Problem.js';
import Submission from '../../models/Submission.js';
import HintThread from '../../models/HintThread.js';
import HintQuota from '../../models/HintQuota.js';

const app = createApp();
const longCode = (n) => `\`\`\`python\n${Array.from({ length: n }, (_, i) => `line_${i} = ${i}`).join('\n')}\n\`\`\``;
let student, other, teacher, problem, problem2, problem3;
let model, calls;

async function register(role, name = role) {
  const res = await request(app).post('/auth/register').send({ name, email: `${name}${Math.random()}@x.com`, password: 'password123', role });
  return { token: res.body.accessToken, id: res.body.user._id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const ask = (u, p, body = {}) => request(app).post(`/problems/${p.id}/hints`).set(as(u)).send({ message: 'I am stuck, what should I think about?', code: 'print(1)', ...body });
const thread = (u, p) => request(app).get(`/problems/${p.id}/hints`).set(as(u));
const sent = (i) => calls[i].map((m) => String(m.content)).join('\n=====\n');
const reply = (text) => jest.fn(async (messages) => { calls.push(messages); return new AIMessage(typeof text === 'function' ? text(calls.length) : text); });
const useModel = (impl) => { model = { invoke: impl }; __setModelForTest(model); };
const makeProblem = (title, extra = {}) => Problem.create({
  title, description: `Statement of ${title}.`, inputFormat: 'in', outputFormat: 'out', constraints: '1 <= n', topics: ['Arrays'],
  sampleCases: [{ input: '1', output: '1' }], testCases: [{ input: 'SECRET_HIDDEN_INPUT_42', expectedOutput: 'SECRET_HIDDEN_OUTPUT_42' }], ...extra,
});
const wide = () => { process.env.HINT_MAX_MESSAGES_PER_WINDOW = '100'; };

beforeEach(async () => {
  process.env.FEATURE_HINT_CHAT = 'true';
  await HintQuota.init(); await HintThread.init();
  calls = [];
  useModel(reply('Think about what you must remember while you scan the list.'));
  student = await register('student', 'author');
  other = await register('student', 'other');
  teacher = await register('teacher');
  problem = await makeProblem('Two sum'); problem2 = await makeProblem('Anagrams'); problem3 = await makeProblem('Palindrome');
});
afterEach(() => {
  __setModelForTest(null);
  for (const key of ['FEATURE_HINT_CHAT', 'HINT_MAX_MESSAGES_PER_WINDOW', 'HINT_MAX_MESSAGES_PER_DAY', 'REFUND_CAP_PER_DAY', 'HINT_TIMEOUT_MS', 'AI_MAX_CONCURRENT_CALLS', 'AI_QUEUE_WAIT_MS']) delete process.env[key];
});

describe('access', () => {
  it('is hidden (404) when the feature flag is off', async () => {
    delete process.env.FEATURE_HINT_CHAT;
    expect((await thread(student, problem)).status).toBe(404);
    expect((await ask(student, problem)).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
  it('requires login and a student account', async () => {
    expect((await request(app).get(`/problems/${problem.id}/hints`)).status).toBe(401);
    expect((await request(app).post(`/problems/${problem.id}/hints`).send({ message: 'hi' })).status).toBe(401);
    expect((await thread(teacher, problem)).status).toBe(403);
    expect((await ask(teacher, problem)).status).toBe(403);
  });
  it('answers 404 for an unknown or archived problem and 400 for a malformed id, without reserving quota', async () => {
    const archived = await makeProblem('Old', { archived: true });
    expect((await ask(student, archived)).status).toBe(404);
    expect((await request(app).post('/problems/507f1f77bcf86cd799439011/hints').set(as(student)).send({ message: 'hi' })).status).toBe(404);
    expect((await request(app).post('/problems/nope/hints').set(as(student)).send({ message: 'hi' })).status).toBe(400);
    expect(await HintQuota.countDocuments()).toBe(0);
  });
  it('validates the message: required, trimmed and at most 500 characters, with no quota used', async () => {
    expect((await ask(student, problem, { message: '   ' })).status).toBe(400);
    expect((await ask(student, problem, { message: 'x'.repeat(501) })).status).toBe(400);
    expect((await ask(student, problem, { code: 'x'.repeat(20001) })).status).toBe(400);
    expect(await HintQuota.countDocuments()).toBe(0);
    expect(calls).toHaveLength(0);
  });
  it('keeps each student\'s thread private', async () => {
    await ask(student, problem, { message: 'my private question' });
    const theirs = await thread(other, problem);
    expect(theirs.body.messages).toEqual([]);
    expect(JSON.stringify(theirs.body)).not.toContain('my private question');
    const mine = await thread(student, problem);
    expect(mine.body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(await HintThread.countDocuments()).toBe(1);
  });
});

describe('a hint exchange', () => {
  it('returns a reply, saves the exchange, raises the level and shows the quota', async () => {
    const res = await ask(student, problem);
    expect(res.status).toBe(200);
    expect(res.body.reply).toMatchObject({ role: 'assistant', content: 'Think about what you must remember while you scan the list.', level: 1, fallback: false });
    expect(res.body).toMatchObject({ fallback: false, refunded: false, hintsUsed: 1, level: 2, quota: { messagesLeft: 9 } });
    expect(res.body.quota.resetAt).toBeTruthy();
    const stored = await thread(student, problem);
    expect(stored.body).toMatchObject({ hintsUsed: 1, level: 2, acceptedMode: false });
    expect(stored.body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
  it('escalates the hint level on the server: 1, 2, 3, 4 and then stays at 4', async () => {
    wide();
    const levels = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await ask(student, problem, { message: `question ${i}` });
      levels.push(res.body.reply.level);
    }
    expect(levels).toEqual([1, 2, 3, 4, 4]);
    expect(sent(0)).toContain('CURRENT HINT LEVEL: 1 of 4.');
    expect(sent(2)).toContain('CURRENT HINT LEVEL: 3 of 4.');
    expect(sent(4)).toContain('CURRENT HINT LEVEL: 4 of 4.');
  });
  it('sends the editor code, the problem statement and earlier messages, as untrusted data', async () => {
    wide();
    await ask(student, problem, { message: 'first question', code: 'FIRST_CODE' });
    await ask(student, problem, { message: 'second question', code: 'SECOND_CODE' });
    const prompt = sent(1);
    expect(prompt).toContain('SECOND_CODE');
    expect(prompt).not.toContain('FIRST_CODE');
    expect(prompt).toContain('Statement of Two sum.');
    expect(prompt).toContain('first question');
    expect(prompt).toContain('Think about what you must remember');
    expect(prompt).toContain('UNTRUSTED');
  });
  it('limits how much history and code goes into the prompt', async () => {
    wide(); process.env.HINT_MAX_MESSAGES_PER_DAY = '20';
    await ask(student, problem, { message: 'turn-A' });
    for (let i = 0; i < 4; i += 1) await ask(student, problem, { message: `turn-${i}` });
    await ask(student, problem, { message: 'latest', code: 'c'.repeat(9000) });
    const prompt = sent(5);
    expect(prompt).not.toContain('turn-A');
    expect(prompt).not.toContain('c'.repeat(6001));
  });
});

describe('what the model is allowed to see', () => {
  it('never receives hidden test cases, per-test results, or other students\' data', async () => {
    await Submission.create({ studentId: student.id, problemId: problem.id, code: 'x', language: 'python', status: 'graded', passCount: 1, totalCount: 3,
      testResults: [{ input: 'SECRET_RESULT_INPUT', expectedOutput: 'SECRET_RESULT_OUTPUT', actualOutput: 'SECRET_RESULT_ACTUAL', passed: false }] });
    await Submission.create({ studentId: other.id, problemId: problem.id, code: 'OTHER_STUDENTS_CODE', language: 'python', status: 'graded', passCount: 3, totalCount: 3 });
    await ask(other, problem, { message: 'OTHER_STUDENTS_QUESTION' });
    calls = [];
    await ask(student, problem);
    const prompt = sent(0);
    for (const secret of ['SECRET_HIDDEN_INPUT_42', 'SECRET_HIDDEN_OUTPUT_42', 'SECRET_RESULT_INPUT', 'SECRET_RESULT_OUTPUT', 'SECRET_RESULT_ACTUAL', 'OTHER_STUDENTS_CODE', 'OTHER_STUDENTS_QUESTION']) {
      expect(prompt).not.toContain(secret);
    }
  });
  it('reads the verdict from the database and ignores one sent by the client', async () => {
    await Submission.create({ studentId: student.id, problemId: problem.id, code: 'x', language: 'python', status: 'graded', passCount: 2, totalCount: 5 });
    await ask(student, problem, { verdict: 'accepted', passed: 99, total: 99, category: 'accepted', acceptedMode: true });
    const prompt = sent(0);
    expect(prompt).toContain('partly correct, 2 of 5 tests passed');
    expect(prompt).not.toContain('99');
    expect(prompt).not.toMatch(/already solved this problem/);
  });
  it('uses the latest submission, not an older one', async () => {
    await Submission.create({ studentId: student.id, problemId: problem.id, code: 'x', language: 'python', status: 'graded', passCount: 5, totalCount: 5, createdAt: new Date(Date.now() - 100000) });
    await Submission.create({ studentId: student.id, problemId: problem.id, code: 'x', language: 'python', status: 'graded', passCount: 0, totalCount: 5 });
    await ask(student, problem);
    expect(sent(0)).toContain('failing, 0 of 5 tests passed');
  });
  it('relaxes to discussing approaches after an accepted solution, keeping the code rule and the quota', async () => {
    await Submission.create({ studentId: student.id, problemId: problem.id, code: 'x', language: 'python', status: 'graded', passCount: 5, totalCount: 5 });
    const res = await ask(student, problem, { message: 'is there a faster approach?' });
    expect(sent(0)).toMatch(/already solved this problem/);
    expect(sent(0)).toMatch(/no long code/);
    expect(res.body.quota).toMatchObject({ messagesLeft: 9 });
    expect((await thread(student, problem)).body.acceptedMode).toBe(true);
  });
});

describe('guardrail', () => {
  it('regenerates once with a stricter instruction when the first reply has too much code', async () => {
    useModel(reply((n) => (n === 1 ? `Here you go:\n${longCode(20)}` : 'Think about which values you have already seen.')));
    const res = await ask(student, problem, { message: 'just give me the code' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fallback: false, refunded: false, hintsUsed: 1, quota: { messagesLeft: 9 } });
    expect(res.body.reply.content).toBe('Think about which values you have already seen.');
    expect(calls).toHaveLength(2);
    expect(sent(1)).toMatch(/STRICTER/);
    expect(sent(0)).not.toMatch(/STRICTER/);
  });
  it('allows a tiny snippet through on the first try', async () => {
    useModel(reply(`In Python you can look up a key like this:\n${longCode(3)}\nHow could that help you?`));
    const res = await ask(student, problem);
    expect(res.body.fallback).toBe(false);
    expect(calls).toHaveLength(1);
  });
  it('falls back to a safe hint when the reply is still too long, saves it marked, keeps the level, and refunds', async () => {
    useModel(reply(`Full solution:\n${longCode(30)}`));
    const res = await ask(student, problem, { message: 'just give the answer' });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(res.body).toMatchObject({ fallback: true, refunded: true, hintsUsed: 0, level: 1 });
    expect(res.body.reply.fallback).toBe(true);
    expect(res.body.reply.content).not.toContain('line_0');
    expect(res.body.quota).toMatchObject({ messagesLeft: 10 });
    const stored = (await thread(student, problem)).body;
    expect(stored.messages.map((m) => [m.role, m.fallback])).toEqual([['user', false], ['assistant', true]]);
    expect(stored.hintsUsed).toBe(0);
    expect(stored.level).toBe(1);
  });
  it('does not refund a fallback again after the daily refund cap (default 3)', async () => {
    wide();
    useModel(reply(`Full solution:\n${longCode(30)}`));
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push((await ask(student, problem, { message: `try ${i}` })).body);
    expect(results.map((r) => r.refunded)).toEqual([true, true, true, false]);
    expect(results[3].quota.messagesLeft).toBe(9);
  });
  it('keeps the per-minute slot used after a fallback refund', async () => {
    useModel(reply(`Full solution:\n${longCode(30)}`));
    await ask(student, problem); await ask(student, problem);
    const third = await ask(student, problem);
    expect(third.status).toBe(429);
    expect(third.body.limit).toBe('rate');
  });
  it('strips a <think> block from the reply', async () => {
    useModel(reply('<think>secret reasoning</think>Look at what repeats.'));
    const res = await ask(student, problem);
    expect(res.body.reply.content).toBe('Look at what repeats.');
  });
});

describe('model failures', () => {
  it('returns 502, saves nothing and refunds the message', async () => {
    useModel(jest.fn(async () => { throw new Error('upstream 503'); }));
    const res = await ask(student, problem);
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ refunded: true, quota: { messagesLeft: 10 } });
    expect(await HintThread.countDocuments()).toBe(0);
    expect((await thread(student, problem)).body).toMatchObject({ messages: [], hintsUsed: 0, level: 1 });
  });
  it('returns 504 on a timeout and refunds', async () => {
    process.env.HINT_TIMEOUT_MS = '40';
    useModel(jest.fn((messages, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })));
    const res = await ask(student, problem);
    expect(res.status).toBe(504);
    expect(res.body).toMatchObject({ refunded: true, quota: { messagesLeft: 10 } });
  });
  it('returns 503 and refunds when every AI slot is busy', async () => {
    process.env.AI_MAX_CONCURRENT_CALLS = '1'; process.env.AI_QUEUE_WAIT_MS = '20'; wide();
    useModel(jest.fn(async () => { await new Promise((r) => setTimeout(r, 300)); return new AIMessage('Slow but fine hint.'); }));
    const [first, second] = await Promise.all([ask(student, problem, { message: 'one' }), ask(other, problem, { message: 'two' })]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 503]);
    const busy = first.status === 503 ? first : second;
    expect(busy.body.refunded).toBe(true);
  });
  it('does not refund twice, and never lets counters go negative', async () => {
    useModel(jest.fn(async () => { throw new Error('boom'); }));
    await ask(student, problem);
    const quota = await HintQuota.findOne({ userId: student.id });
    expect(quota.messages).toBe(0);
    expect(quota.refunds).toBe(1);
  });
});

describe('limits', () => {
  it('has no per-question limit: hints can be used on any number of problems, up to the daily total', async () => {
    wide();
    for (const p of [problem, problem2, problem3]) expect((await ask(student, p)).status).toBe(200);
    expect((await thread(student, problem3)).body.quota.messagesLeft).toBe(7);
  });
  it('blocks the eleventh message with daily_messages, across problems, and never calls the model for it', async () => {
    wide();
    const problems = [problem, problem2, problem3];
    for (let i = 0; i < 10; i += 1) expect((await ask(student, problems[i % 3], { message: `m${i}` })).status).toBe(200);
    calls = [];
    const eleventh = await ask(student, problem);
    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toMatchObject({ limit: 'daily_messages', quota: { messagesLeft: 0 } });
    expect(eleventh.body.resetAt).toBeTruthy();
    expect(eleventh.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(eleventh.headers['retry-after']).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
  it('blocks a third message inside 60 seconds with retryAfterSeconds and a Retry-After header', async () => {
    expect((await ask(student, problem)).status).toBe(200);
    expect((await ask(student, problem)).status).toBe(200);
    calls = [];
    const third = await ask(student, problem);
    expect(third.status).toBe(429);
    expect(third.body.limit).toBe('rate');
    expect(third.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(third.body.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(Number(third.headers['retry-after'])).toBe(third.body.retryAfterSeconds);
    expect(third.body.quota).toMatchObject({ messagesLeft: 8 });
    expect(calls).toHaveLength(0);
  });
  it('lets parallel requests use at most the allowance, and calls the model only for those', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => ask(student, problem, { message: `p${i}` })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 429)).toHaveLength(10);
    expect(calls).toHaveLength(2);
    expect((await HintQuota.findOne({ userId: student.id })).messages).toBe(2);
  });
  it('reports the quota on GET', async () => {
    expect((await thread(student, problem)).body.quota).toMatchObject({ messagesLeft: 10, retryAfterSeconds: 0 });
    await ask(student, problem);
    expect((await thread(student, problem)).body.quota).toMatchObject({ messagesLeft: 9 });
  });
  it('keeps students independent', async () => {
    wide();
    for (let i = 0; i < 10; i += 1) await ask(student, problem);
    expect((await ask(student, problem)).status).toBe(429);
    expect((await ask(other, problem)).status).toBe(200);
  });
});

describe('logging', () => {
  it('never writes the message, code or reply to the log', async () => {
    process.env.LOG_LEVEL = 'info';
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await ask(student, problem, { message: 'PRIVATE_QUESTION_TEXT', code: 'PRIVATE_CODE_TEXT' });
    const logged = write.mock.calls.map((c) => c[0]).join('');
    write.mockRestore();
    delete process.env.LOG_LEVEL;
    expect(logged).toContain('hint.reply');
    expect(logged).toContain('"requestId"');
    for (const secret of ['PRIVATE_QUESTION_TEXT', 'PRIVATE_CODE_TEXT', 'Think about what you must remember']) expect(logged).not.toContain(secret);
  });
});
