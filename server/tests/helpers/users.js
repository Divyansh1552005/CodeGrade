// Test-only. Public signup always creates a student, so a test that needs another role creates the user
// directly in the database, the way an admin tool would. Never import this from application code (a test
// in tests/integration/routeAccess.test.js checks that nothing under the application folders does).
import request from 'supertest';
import User from '../../models/User.js';
import { issueTokenPair } from '../../services/tokenService.js';

let counter = 0;

/** Creates a user with any role and returns it with a ready access token and refresh token. */
export async function createUser({ role = 'student', name, email, password = 'password123', ...fields } = {}) {
  counter += 1;
  const user = await User.create({
    name: name ?? `${role} ${counter}`,
    email: email ?? `${role.replace('_', '-')}-${counter}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    passwordHash: await User.hashPassword(password),
    role,
    ...fields,
  });
  const { accessToken, refreshToken } = await issueTokenPair(user);
  return { user, accessToken, refreshToken, password, email: user.email };
}

/**
 * POST /auth/register with the given body, then set `role` directly. The body goes to the API as given
 * (add `accountType` yourself); `role` is only used for the direct update.
 * Pass a supertest agent as `agent` when the test needs the refresh cookie to persist.
 */
export async function registerAs(app, { role = 'student', ...body }, agent = request(app)) {
  const res = await agent.post('/auth/register').send({ accountType: 'student', ...body });
  if (res.status === 201 && role !== 'student') {
    await User.updateOne({ _id: res.body.user._id }, { $set: { role } });
    res.body.user.role = role;
  }
  return res;
}
