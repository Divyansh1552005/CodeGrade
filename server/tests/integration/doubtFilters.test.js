import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import Doubt from '../../models/Doubt.js';
import Answer from '../../models/Answer.js';

const app = createApp();
let author, other, teacher, d;

async function register(role, name = role) {
  const res = await request(app).post('/auth/register').send({ name, email: `${name}${Math.random()}@x.com`, password: 'password123', role });
  return { token: res.body.accessToken, id: res.body.user._id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const make = (studentId, title, over = {}) => Doubt.create({ studentId, title, body: 'B', ...over });
const approve = async (doubt) => {
  const a = await Answer.create({ doubtId: doubt.id, content: 'An answer', source: 'teacher', state: 'pending' });
  a.state = 'approved'; a.reviewedAt = new Date(); await a.save();
};
async function ids(viewer, query) {
  const found = [];
  let cursor = '';
  for (let i = 0; i < 20; i += 1) {
    const res = await request(app).get(`/doubts?limit=1&${query}${cursor ? `&cursor=${cursor}` : ''}`).set(as(viewer));
    expect(res.status).toBe(200);
    found.push(...res.body.doubts.map((x) => x._id));
    if (!res.body.hasMore) return found;
    cursor = res.body.nextCursor;
  }
  throw new Error('pagination did not end');
}

beforeEach(async () => {
  author = await register('student', 'author');
  other = await register('student', 'other');
  teacher = await register('teacher');
  d = {
    answered: await make(author.id, 'answered', { status: 'pending_review', aiDraftStatus: 'success' }),
    waiting: await make(author.id, 'waiting', { status: 'pending_review', aiDraftStatus: 'success' }),
    legacy: await make(other.id, 'legacy waiting'),
    needsTeacher: await make(other.id, 'needs teacher', { status: 'pending_review', aiDraftStatus: 'failed' }),
    appealed: await make(other.id, 'appealed', { status: 'appealed', aiDraftStatus: 'skipped' }),
    checking: await make(author.id, 'checking', { status: 'pending_triage' }),
    removed: await make(author.id, 'removed', { status: 'auto_rejected', aiDraftStatus: 'irrelevant' }),
    offTopicLegacy: await make(other.id, 'off topic legacy', { aiDraftStatus: 'irrelevant' }),
  };
  await approve(d.answered);
});
const id = (...keys) => keys.map((k) => d[k].id).sort();

describe('GET /doubts?status=', () => {
  it('answered lists only doubts with an approved answer', async () => {
    expect((await ids(other, 'status=answered')).sort()).toEqual(id('answered'));
  });
  it('awaiting_review lists unanswered doubts whose AI draft is with a teacher (older doubts included)', async () => {
    expect((await ids(other, 'status=awaiting_review')).sort()).toEqual(id('waiting', 'legacy'));
  });
  it('awaiting_teacher lists unanswered doubts a teacher must answer by hand, appealed ones included', async () => {
    expect((await ids(other, 'status=awaiting_teacher')).sort()).toEqual(id('needsTeacher', 'appealed'));
  });
  it('does not filter without a status', async () => {
    const all = await ids(other, '');
    expect(all).toEqual(expect.arrayContaining(id('answered', 'waiting', 'legacy', 'needsTeacher', 'appealed')));
  });
  it('never returns a removed doubt for any filter or viewer, and shows "Checking" only to its author', async () => {
    for (const who of [author, other, teacher]) {
      for (const status of ['answered', 'awaiting_review', 'awaiting_teacher', '']) {
        const found = await ids(who, status ? `status=${status}` : '');
        expect(found).not.toContain(d.removed.id);
      }
    }
    // A doubt being checked is not any of the three statuses, so no filter lists it.
    for (const status of ['answered', 'awaiting_review', 'awaiting_teacher']) expect(await ids(author, `status=${status}`)).not.toContain(d.checking.id);
  });
  it('works for teachers too, and with mine=1', async () => {
    expect((await ids(teacher, 'status=awaiting_teacher')).sort()).toEqual(id('needsTeacher', 'appealed'));
    expect((await ids(author, 'status=awaiting_review&mine=1')).sort()).toEqual(id('waiting'));
    expect((await ids(author, 'status=answered&mine=1')).sort()).toEqual(id('answered'));
    expect(await ids(author, 'status=awaiting_teacher&mine=1')).toEqual([]);
  });
  it('paginates a filtered list without losing or repeating rows', async () => {
    for (let i = 0; i < 5; i += 1) await make(other.id, `extra ${i}`, { status: 'pending_review', aiDraftStatus: 'success' });
    const found = await ids(other, 'status=awaiting_review');
    expect(new Set(found).size).toBe(found.length);
    expect(found).toHaveLength(7);
  });
  it('rejects an unknown status with 400', async () => {
    expect((await request(app).get('/doubts?status=bogus').set(as(other))).status).toBe(400);
  });
  it('treats an answered doubt as answered even if its AI draft failed', async () => {
    await Doubt.updateOne({ _id: d.answered.id }, { $set: { aiDraftStatus: 'failed' } });
    expect(await ids(other, 'status=awaiting_teacher')).not.toContain(d.answered.id);
    expect(await ids(other, 'status=answered')).toContain(d.answered.id);
  });
});
