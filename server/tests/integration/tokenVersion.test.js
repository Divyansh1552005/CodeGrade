import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import User from '../../models/User.js';
import { revokeAllSessions } from '../../services/tokenService.js';

const app = createApp();
const register = () => request(app).post('/auth/register').send({ name: 'T', email: `t${Math.random()}@x.com`, password: 'password123', role: 'student' });
const cookieOf = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('refreshToken=')).split(';')[0];
const me = (token) => request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

describe('token version', () => {
  it('puts the version in both tokens and ends every session when it is raised', async () => {
    const reg = await register();
    expect(jwt.decode(reg.body.accessToken).tv).toBe(0);
    const cookie = cookieOf(reg);
    expect((await me(reg.body.accessToken)).status).toBe(200);
    await revokeAllSessions(reg.body.user._id);
    expect((await me(reg.body.accessToken)).status).toBe(401);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    const login = await request(app).post('/auth/login').send({ email: reg.body.user.email, password: 'password123' });
    expect(jwt.decode(login.body.accessToken).tv).toBe(1);
    expect((await me(login.body.accessToken)).status).toBe(200);
  });
  it('accepts tokens issued before the version existed', async () => {
    const reg = await register();
    const legacy = jwt.sign({ sub: reg.body.user._id, role: 'student' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
    expect((await me(legacy)).status).toBe(200);
    await User.updateOne({ _id: reg.body.user._id }, { $unset: { tokenVersion: 1 } });
    expect((await me(legacy)).status).toBe(200);
  });
  it('does not expose the version or password hash on the user', async () => {
    const reg = await register();
    expect(reg.body.user.tokenVersion).toBeUndefined();
    expect(reg.body.user.passwordHash).toBeUndefined();
  });
});
