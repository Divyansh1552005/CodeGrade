import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';

const app = createApp();

function register(agent, role = 'student') {
  return agent.post('/auth/register').send({
    name: role,
    email: `${role}${Math.random()}@x.com`,
    password: 'password123',
    role,
  });
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
