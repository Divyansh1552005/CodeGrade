import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import { registerAs } from '../helpers/users.js';

const app = createApp();

function register(agent, role = 'student') {
  return registerAs(app, {
    name: role,
    email: `${role}${Math.random()}@x.com`,
    password: 'password123',
    role,
  }, agent);
}

// Pull the refresh cookie value out of a Set-Cookie header array.
function refreshCookie(res) {
  const raw = res.headers['set-cookie'] || [];
  return raw.find((c) => c.startsWith('refreshToken='));
}

describe('Auth: access token (Bearer) + refresh cookie', () => {
  it('returns an access token in the body and sets an httpOnly refresh cookie', async () => {
    const res = await register(request(app));
    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = refreshCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('authorizes /auth/me with the Bearer access token', async () => {
    const reg = await register(request(app));
    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(reg.body.user.email);
  });

  it('rejects /auth/me without a token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('rotates the refresh token and issues a new access token', async () => {
    const agent = request.agent(app); // persists cookies
    await register(agent);
    const refreshed = await agent.post('/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.accessToken).toBe('string');
    // A new refresh cookie is set (rotation).
    expect(refreshCookie(refreshed)).toBeDefined();
  });

  it('detects refresh-token reuse and revokes the family', async () => {
    // Capture the ORIGINAL refresh cookie, rotate once (revoking it), then try
    // to reuse the original -> must be rejected as reuse.
    const reg = await register(request(app));
    const original = refreshCookie(reg);

    // First use of the original: succeeds and rotates.
    const first = await request(app).post('/auth/refresh').set('Cookie', original);
    expect(first.status).toBe(200);

    // Replay the original (now-revoked) token: reuse detected.
    const replay = await request(app).post('/auth/refresh').set('Cookie', original);
    expect(replay.status).toBe(401);

    // And the rotated token from `first` is now also revoked (family killed),
    // so it can no longer be used either.
    const rotated = refreshCookie(first);
    const afterFamilyRevoke = await request(app)
      .post('/auth/refresh')
      .set('Cookie', rotated);
    expect(afterFamilyRevoke.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const agent = request.agent(app);
    await register(agent);
    const out = await agent.post('/auth/logout');
    expect(out.status).toBe(204);
    // The cookie is cleared, so a subsequent refresh has nothing to present.
    const after = await agent.post('/auth/refresh');
    expect(after.status).toBe(401);
  });
});

describe('Signup role', () => {
  const body = (extra = {}) => ({ name: 'Mallory', email: `m${Math.random()}@x.com`, password: 'password123', ...extra });
  it.each(['teacher', 'admin', 'nonsense', undefined])('creates a student whatever role the body asks for (%s)', async (role) => {
    const res = await request(app).post('/auth/register').send(body({ role }));
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('student');
    const User = (await import('../../models/User.js')).default;
    expect((await User.findOne({ email: res.body.user.email })).role).toBe('student');
  });
  it('does not let other privileged fields through either', async () => {
    const res = await request(app).post('/auth/register').send(body({ role: 'teacher', isAdmin: true, emailVerified: false, tokenVersion: 9 }));
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('student');
  });
  it('can only reach the teacher routes after the role is set outside the API', async () => {
    const res = await request(app).post('/auth/register').send(body({ role: 'teacher' }));
    const list = await request(app).get('/answers?state=pending').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(list.status).toBe(403);
  });
});
