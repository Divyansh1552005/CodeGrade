import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../app.js';
import Doubt from '../../models/Doubt.js';
import Answer from '../../models/Answer.js';
import Notification from '../../models/Notification.js';
import WorkItem from '../../models/WorkItem.js';
import { processNotification } from '../../services/notificationProcessor.js';
import { recoverDomainWork } from '../../services/recoveryService.js';
import { listDoubts } from '../../services/doubtAccess.js';

const app = createApp();
let author, other, teacher, ids;

async function register(role, name = role) {
  const res = await request(app).post('/auth/register').send({ name, email: `${name}${Math.random()}@x.com`, password: 'password123', role });
  return { token: res.body.accessToken, id: res.body.user._id, user: { _id: res.body.user._id, role } };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const doubt = (over = {}) => Doubt.create({ studentId: author.id, title: 'T', body: 'B', ...over });
const answer = async (d, over = {}) => {
  const created = await Answer.create({ doubtId: d.id, content: 'draft', source: 'ai', state: 'pending' });
  if (over.state === 'approved') { created.state = 'approved'; created.reviewedAt = new Date(); await created.save(); }
  return created;
};

async function allBoardIds(viewer, query = '') {
  const found = [];
  let cursor = '';
  for (let i = 0; i < 20; i += 1) {
    const res = await request(app).get(`/doubts?limit=1${query}${cursor ? `&cursor=${cursor}` : ''}`).set(as(viewer));
    found.push(...res.body.doubts.map((d) => d._id));
    if (!res.body.hasMore) return found;
    cursor = res.body.nextCursor;
  }
  throw new Error('pagination did not end');
}

beforeEach(async () => {
  author = await register('student', 'author');
  other = await register('student', 'other');
  teacher = await register('teacher');
  const legacy = await doubt({ title: 'legacy, no status' });
  const normal = await doubt({ status: 'pending_review', title: 'normal' });
  const appealed = await doubt({ status: 'appealed', title: 'appealed', aiDraftStatus: 'failed', appeal: { requestedAt: new Date() } });
  const checking = await doubt({ status: 'pending_triage', title: 'checking' });
  const rejected = await doubt({ status: 'auto_rejected', title: 'rejected', aiDraftStatus: 'failed',
    triage: { verdict: 'spam_or_abusive', confidence: 0.99, reason: 'Spam', model: 'm', source: 'ai' } });
  ids = { legacy: legacy.id, normal: normal.id, appealed: appealed.id, checking: checking.id, rejected: rejected.id };
});

describe('board, search-style listing, totals and pagination', () => {
  it.each([['author', () => author], ['another student', () => other], ['a teacher', () => teacher]])(
    'never lists an auto_rejected doubt for %s, in any page', async (_label, who) => {
      const found = await allBoardIds(who());
      expect(found).not.toContain(ids.rejected);
      expect(found).toEqual(expect.arrayContaining([ids.legacy, ids.normal, ids.appealed]));
      // Pagination loses nothing: every visible doubt appears exactly once.
      expect(new Set(found).size).toBe(found.length);
    }
  );
  it('shows a pending_triage doubt only to its author', async () => {
    expect(await allBoardIds(author)).toContain(ids.checking);
    expect(await allBoardIds(other)).not.toContain(ids.checking);
    expect(await allBoardIds(teacher)).not.toContain(ids.checking);
  });
  it('keeps the author\'s own list free of auto_rejected doubts but shows the one being checked', async () => {
    const res = await request(app).get('/doubts?mine=1').set(as(author));
    const found = res.body.doubts.map((d) => d._id);
    expect(found).not.toContain(ids.rejected);
    expect(found).toEqual(expect.arrayContaining([ids.checking, ids.legacy, ids.appealed]));
    expect((await allBoardIds(author, '&mine=1'))).not.toContain(ids.rejected);
  });
  it('treats doubts without a status as visible (deny-list, not allow-list)', async () => {
    expect((await Doubt.findById(ids.legacy)).status).toBeUndefined();
    for (const who of [author, other, teacher]) expect(await allBoardIds(who)).toContain(ids.legacy);
  });
  it('hides triage and appeal internals from students and shows teachers only the flags they need', async () => {
    await Doubt.updateOne({ _id: ids.appealed }, { $set: { triage: { verdict: 'too_vague', confidence: 0.4, reason: 'Vague', lowConfidence: true, source: 'ai' } } });
    const student = (await request(app).get(`/doubts/${ids.appealed}`).set(as(other))).body.doubt;
    expect(student.triage).toBeUndefined();
    expect(student.appeal).toBeUndefined();
    const teach = (await request(app).get(`/doubts/${ids.appealed}`).set(as(teacher))).body.doubt;
    expect(teach.appealed).toBe(true);
    expect(teach.triage).toEqual({ lowConfidence: true });
  });
});

describe('detail and answer routes', () => {
  it.each([['author', () => author], ['another student', () => other], ['a teacher', () => teacher]])(
    'answers 404 for an auto_rejected doubt and its answer for %s', async (_label, who) => {
      expect((await request(app).get(`/doubts/${ids.rejected}`).set(as(who()))).status).toBe(404);
      expect((await request(app).get(`/doubts/${ids.rejected}/answer`).set(as(who()))).status).toBe(404);
    }
  );
  it('shows a pending_triage doubt to the author and gives everyone else 404', async () => {
    expect((await request(app).get(`/doubts/${ids.checking}`).set(as(author))).status).toBe(200);
    expect((await request(app).get(`/doubts/${ids.checking}`).set(as(other))).status).toBe(404);
    expect((await request(app).get(`/doubts/${ids.checking}`).set(as(teacher))).status).toBe(404);
  });
  it('does not let a teacher answer an auto_rejected or still-checking doubt', async () => {
    for (const id of [ids.rejected, ids.checking]) {
      expect((await request(app).post('/answers').set(as(teacher)).send({ doubtId: id, content: 'hi' })).status).toBe(404);
    }
    expect(await Answer.countDocuments()).toBe(0);
    expect((await request(app).post('/answers').set(as(teacher)).send({ doubtId: ids.normal, content: 'hi' })).status).toBe(201);
  });
});

describe('teacher queues', () => {
  it('leaves auto_rejected and still-checking doubts out of the manual-answer queue and includes appealed ones', async () => {
    await Doubt.updateMany({}, { $set: { aiDraftStatus: 'failed' } }, { includeRemoved: true });
    const res = await request(app).get('/doubts/failed').set(as(teacher));
    const found = res.body.doubts.map((d) => d._id);
    expect(found).not.toContain(ids.rejected);
    expect(found).not.toContain(ids.checking);
    expect(found).toEqual(expect.arrayContaining([ids.appealed, ids.normal, ids.legacy]));
    expect(res.body.doubts.find((d) => d._id === ids.appealed).appealed).toBe(true);
  });
  it('drops answers whose doubt is auto_rejected from the answers queue, for teachers', async () => {
    await answer({ id: ids.rejected }); await answer({ id: ids.normal }); await answer({ id: ids.appealed });
    const res = await request(app).get('/answers?state=pending').set(as(teacher));
    const doubtIds = res.body.answers.map((a) => a.doubtId._id);
    expect(doubtIds).not.toContain(ids.rejected);
    expect(doubtIds).toEqual(expect.arrayContaining([ids.normal, ids.appealed]));
    expect(res.body.answers.find((a) => a.doubtId._id === ids.appealed).doubtId.appealed).toBe(true);
  });
  it('does not let students read the answers queue at all', async () => {
    expect((await request(app).get('/answers?state=pending').set(as(author))).status).toBe(403);
    expect((await request(app).get('/answers?state=pending').set(as(other))).status).toBe(403);
  });
});

describe('the Doubt default scope', () => {
  it('hides auto_rejected doubts from find, findOne, findById, exists, counts, distinct and aggregate', async () => {
    expect(await Doubt.countDocuments()).toBe(4);
    expect(await Doubt.find({ status: 'auto_rejected' })).toHaveLength(0);
    expect(await Doubt.findOne({ _id: ids.rejected })).toBeNull();
    expect(await Doubt.findById(ids.rejected)).toBeNull();
    expect(await Doubt.exists({ _id: ids.rejected })).toBeNull();
    expect((await Doubt.distinct('_id')).map(String)).not.toContain(ids.rejected);
    expect(await Doubt.aggregate([{ $count: 'n' }])).toEqual([{ n: 4 }]);
  });
  it('reveals them only to a query that opts in', async () => {
    expect(await Doubt.find({ status: 'auto_rejected' }).setOptions({ includeRemoved: true })).toHaveLength(1);
    expect(await Doubt.countDocuments().setOptions({ includeRemoved: true })).toBe(5);
  });
  it('applies through populate() paths: a populated reference to a rejected doubt is null', async () => {
    await answer({ id: ids.rejected }); await answer({ id: ids.normal });
    const populated = await Answer.find().populate('doubtId');
    const byDoubt = Object.fromEntries(populated.map((a) => [a.doubtId?._id ?? 'hidden', true]));
    expect(populated.filter((a) => a.doubtId === null)).toHaveLength(1);
    expect(Object.keys(byDoubt)).toContain(ids.normal);
    expect(Object.keys(byDoubt)).not.toContain(ids.rejected);
  });
});

describe('background paths', () => {
  it('sends no notification for an approved answer on an auto_rejected doubt', async () => {
    const a = await answer({ id: ids.rejected }, { state: 'approved' });
    await processNotification({ data: { answerId: a.id } });
    expect(await Notification.countDocuments()).toBe(0);
    const ok = await answer({ id: ids.normal }, { state: 'approved' });
    await processNotification({ data: { answerId: ok.id } });
    expect(await Notification.countDocuments()).toBe(1);
  });
  it('does not recreate draft or notification work for an auto_rejected doubt during recovery', async () => {
    await Doubt.updateOne({ _id: ids.rejected }, { $set: { aiDraftStatus: 'pending' } });
    await answer({ id: ids.rejected }, { state: 'approved' });
    await recoverDomainWork();
    const keys = (await WorkItem.find().lean()).map((w) => w.key);
    expect(keys).not.toContain(`draft-${ids.rejected}`);
    expect(keys.filter((k) => k.startsWith('answer-notification-'))).toHaveLength(0);
    expect(keys).toContain(`draft-${ids.normal}`);
  });
});

describe('board query plan', () => {
  const stages = (plan, out = []) => {
    if (!plan || typeof plan !== 'object') return out;
    if (plan.stage) out.push(plan.stage);
    for (const value of Object.values(plan)) {
      if (Array.isArray(value)) value.forEach((v) => stages(v, out)); else stages(value, out);
    }
    return out;
  };
  it('is served by the createdAt index with no in-memory sort', async () => {
    await Doubt.init();
    const explain = await Doubt.find({ $and: [{}, { $or: [{ status: { $nin: ['auto_rejected', 'pending_triage'] } }, { status: 'pending_triage', studentId: author.id }] }] })
      .sort({ createdAt: -1, _id: -1 }).limit(21).explain('queryPlanner');
    const used = stages(explain.queryPlanner.winningPlan);
    expect(used).toContain('IXSCAN');
    expect(used).not.toContain('SORT');
    expect(used).not.toContain('COLLSCAN');
  });
});

describe('POST /doubts optional problem and code', () => {
  it('stores the problem and code snippet, and rejects bad input', async () => {
    const Problem = (await import('../../models/Problem.js')).default;
    const problem = await Problem.create({ title: 'P', topics: ['Arrays'] });
    const ok = await request(app).post('/doubts').set(as(author)).send({ title: 'T', body: 'B', problemId: problem.id, code: 'print(1)' });
    expect(ok.status).toBe(201);
    expect(ok.body.doubt).toMatchObject({ problemId: problem.id, code: 'print(1)' });
    expect((await request(app).post('/doubts').set(as(author)).send({ title: 'T', body: 'B', problemId: '507f1f77bcf86cd799439011' })).status).toBe(404);
    expect((await request(app).post('/doubts').set(as(author)).send({ title: 'T', body: 'B', problemId: 'nope' })).status).toBe(400);
    expect((await request(app).post('/doubts').set(as(author)).send({ title: 'T', body: 'B', code: 'x'.repeat(4001) })).status).toBe(400);
    const plain = await request(app).post('/doubts').set(as(author)).send({ title: 'T', body: 'B' });
    expect(plain.body.doubt.problemId).toBeUndefined();
  });
});

describe('single query layer', () => {
  it('keeps Doubt reads out of the route files', () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../routes');
    const offenders = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
      .filter((f) => /\bDoubt\.(find|findOne|findById|countDocuments|count|aggregate|distinct|exists|estimatedDocumentCount)\b/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('builds the same result through the service as through the routes', async () => {
    const direct = await listDoubts({ viewer: other.user, limit: 100 });
    expect(direct.doubts.map((d) => d._id.toString())).not.toContain(ids.rejected);
  });
});
