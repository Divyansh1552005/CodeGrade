import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import Notification from '../../models/Notification.js';
import { createNotification, NOTIFICATION_TTL_DAYS } from '../../services/notificationService.js';

const app = createApp();
let alice, bob;

async function register(name) {
  const res = await request(app).post('/auth/register').send({ name, email: `${name}${Math.random()}@x.com`, password: 'password123', accountType: 'student' });
  return { token: res.body.accessToken, id: res.body.user._id };
}
const as = (user) => ({ Authorization: `Bearer ${user.token}` });
const note = (user, n, extra = {}) => createNotification({ key: `t-${user.id}-${n}`, userId: user.id, type: 'test', title: `Title ${n}`, body: `Body ${n}`, link: `/x/${n}`, ...extra });

beforeEach(async () => {
  await Notification.init();
  alice = await register('alice');
  bob = await register('bob');
});

describe('notification access control', () => {
  it('requires authentication on every route', async () => {
    expect((await request(app).get('/notifications')).status).toBe(401);
    expect((await request(app).get('/notifications/unread-count')).status).toBe(401);
    expect((await request(app).post('/notifications/read-all')).status).toBe(401);
    expect((await request(app).patch('/notifications/507f1f77bcf86cd799439011/read')).status).toBe(401);
  });
  it('lists only the signed-in user\'s notifications', async () => {
    await note(alice, 1); await note(bob, 2);
    const res = await request(app).get('/notifications').set(as(alice));
    expect(res.body.notifications.map((n) => n.title)).toEqual(['Title 1']);
    expect(res.body.notifications[0]).toMatchObject({ type: 'test', body: 'Body 1', link: '/x/1', readAt: null });
  });
  it('answers 404 when marking another user\'s notification and leaves it unread', async () => {
    const theirs = await note(bob, 1);
    const res = await request(app).patch(`/notifications/${theirs.id}/read`).set(as(alice));
    expect(res.status).toBe(404);
    expect((await Notification.findById(theirs.id)).readAt).toBeUndefined();
  });
  it('rejects a malformed id with 400', async () => {
    expect((await request(app).patch('/notifications/not-an-id/read').set(as(alice))).status).toBe(400);
  });
});

describe('unread count and marking read', () => {
  it('counts only own unread notifications and drops as they are read', async () => {
    const first = await note(alice, 1); await note(alice, 2); await note(bob, 3);
    expect((await request(app).get('/notifications/unread-count').set(as(alice))).body).toEqual({ unread: 2 });
    const read = await request(app).patch(`/notifications/${first.id}/read`).set(as(alice));
    expect(read.status).toBe(200);
    expect(read.body.notification.readAt).toBeTruthy();
    expect((await request(app).get('/notifications/unread-count').set(as(alice))).body).toEqual({ unread: 1 });
  });
  it('keeps the original read time when marked read twice', async () => {
    const n = await note(alice, 1);
    const one = await request(app).patch(`/notifications/${n.id}/read`).set(as(alice));
    await new Promise((r) => setTimeout(r, 15));
    const two = await request(app).patch(`/notifications/${n.id}/read`).set(as(alice));
    expect(two.body.notification.readAt).toBe(one.body.notification.readAt);
  });
  it('read-all marks only the caller\'s notifications', async () => {
    await note(alice, 1); await note(alice, 2); const other = await note(bob, 3);
    const res = await request(app).post('/notifications/read-all').set(as(alice));
    expect(res.body).toEqual({ updated: 2 });
    expect((await request(app).get('/notifications/unread-count').set(as(alice))).body.unread).toBe(0);
    expect((await Notification.findById(other.id)).readAt).toBeUndefined();
  });
});

describe('listing and storage', () => {
  it('paginates newest first with a cursor', async () => {
    for (let i = 1; i <= 5; i += 1) { await note(alice, i); await new Promise((r) => setTimeout(r, 5)); }
    const page1 = await request(app).get('/notifications?limit=2').set(as(alice));
    expect(page1.body.notifications.map((n) => n.title)).toEqual(['Title 5', 'Title 4']);
    expect(page1.body.hasMore).toBe(true);
    const page2 = await request(app).get(`/notifications?limit=2&cursor=${page1.body.nextCursor}`).set(as(alice));
    expect(page2.body.notifications.map((n) => n.title)).toEqual(['Title 3', 'Title 2']);
    const page3 = await request(app).get(`/notifications?limit=2&cursor=${page2.body.nextCursor}`).set(as(alice));
    expect(page3.body).toMatchObject({ hasMore: false, nextCursor: null });
    expect(page3.body.notifications.map((n) => n.title)).toEqual(['Title 1']);
  });
  it('caps the page size', async () => {
    expect((await request(app).get('/notifications?limit=500').set(as(alice))).status).toBe(400);
  });
  it('is created once per key, with a 90 day expiry on new rows', async () => {
    const a = await note(alice, 1); const b = await note(alice, 1, { title: 'Changed' });
    expect(String(a._id)).toBe(String(b._id));
    expect(b.title).toBe('Title 1');
    expect(await Notification.countDocuments({ userId: alice.id })).toBe(1);
    const days = (a.expiresAt - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(NOTIFICATION_TTL_DAYS - 1);
    expect(days).toBeLessThanOrEqual(NOTIFICATION_TTL_DAYS);
  });
  it('creates a TTL index on expiresAt', async () => {
    const indexes = await Notification.collection.indexes();
    expect(indexes.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
  });
  it('shows older rows without type, title or expiry through the same API and leaves them unexpiring', async () => {
    const legacy = await Notification.create({ key: 'answer-legacy', userId: alice.id, message: 'Old message', href: '/doubts/d1' });
    expect(legacy.expiresAt).toBeUndefined();
    const res = await request(app).get('/notifications').set(as(alice));
    expect(res.body.notifications[0]).toMatchObject({ type: 'answer', title: 'Old message', body: '', link: '/doubts/d1' });
  });
  it('still serves the dashboard\'s /activity/notifications', async () => {
    await note(alice, 1);
    const res = await request(app).get('/activity/notifications').set(as(alice));
    expect(res.body.notifications[0]).toMatchObject({ message: 'Title 1: Body 1', href: '/x/1' });
  });
});
