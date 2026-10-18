// Test-only. Public signup always creates a student, so a test that needs a teacher registers through the
// API and then sets the role directly in the database, the way an admin tool would. Never import this from
// application code.
import request from 'supertest';
import User from '../../models/User.js';

/** POST /auth/register with the given body; `role` is applied to the stored user afterwards. */
/** Pass a supertest agent as `agent` when the test needs the refresh cookie to persist. */
export async function registerAs(app, { role = 'student', ...body }, agent = request(app)) {
  const res = await agent.post('/auth/register').send(body);
  if (res.status === 201 && role !== 'student') {
    await User.updateOne({ _id: res.body.user._id }, { $set: { role } });
    res.body.user.role = role;
  }
  return res;
}
