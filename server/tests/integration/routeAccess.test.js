import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../app.js';
import { createUser } from '../helpers/users.js';
import { listRoutes } from '../helpers/routes.js';

const app = createApp();
const ID = '507f1f77bcf86cd799439011';

// EVERY route the app serves needs an entry here. Adding a route without one fails the first test below,
// so nobody can ship a route whose access rule was never decided.
//   public     : no login needed on purpose (the allowlist of public routes)
//   any        : any signed-in role, including an applicant and the admin
//   app        : students and teachers
//   student    : students only
//   teacher    : teachers only
const POLICY = {
  'GET /health': 'public',
  'GET /auth/config': 'public',
  'POST /auth/register': 'public', 'POST /auth/login': 'public', 'POST /auth/refresh': 'public', 'POST /auth/logout': 'public',
  'POST /auth/verify-email': 'public', 'POST /auth/resend-verification': 'public', 'POST /auth/forgot-password': 'public', 'POST /auth/reset-password': 'public',
  'GET /auth/me': 'any',
  'GET /features': 'app',
  'GET /activity/leaderboard': 'app', 'GET /activity/notifications': 'app', 'PATCH /activity/notifications/:id/read': 'app', 'GET /activity/progress': 'app',
  'GET /leaderboard': 'app',
  'GET /notifications': 'app', 'GET /notifications/unread-count': 'app', 'POST /notifications/read-all': 'app', 'PATCH /notifications/:id/read': 'app',
  'GET /problems': 'app', 'GET /problems/stats/counts': 'app', 'GET /problems/:id': 'app',
  'POST /problems': 'teacher', 'PATCH /problems/:id': 'teacher', 'DELETE /problems/:id': 'teacher',
  'GET /problems/:problemId/hints': 'student', 'POST /problems/:problemId/hints': 'student',
  'GET /submissions': 'app', 'GET /submissions/:id': 'app', 'POST /submissions': 'student',
  'GET /doubts': 'app', 'GET /doubts/:id': 'app', 'GET /doubts/:id/answer': 'app', 'GET /doubts/:id/removed': 'app',
  'POST /doubts': 'student', 'POST /doubts/:id/appeal': 'student',
  'GET /doubts/failed': 'teacher', 'POST /doubts/:id/off-topic': 'teacher',
  'GET /answers': 'teacher', 'POST /answers': 'teacher', 'PATCH /answers/:id/approve': 'teacher', 'PATCH /answers/:id/reject': 'teacher',
  'GET /jobs': 'teacher', 'POST /jobs': 'teacher', 'GET /jobs/:id': 'teacher',
};

const ALLOWED = {
  any: ['student', 'teacher', 'teacher_applicant', 'admin'],
  app: ['student', 'teacher'],
  student: ['student'],
  teacher: ['teacher'],
};
const ACTORS = ['student', 'teacher', 'teacher_applicant', 'admin', 'suspended'];

const routes = listRoutes(app);
const key = (r) => `${r.method} ${r.path}`;

describe('route access rules', () => {
  it('has an explicit rule for every route, and no rule for a route that does not exist', () => {
    const served = routes.map(key).sort();
    expect(served.filter((k) => !POLICY[k])).toEqual([]);
    expect(Object.keys(POLICY).filter((k) => !served.includes(k))).toEqual([]);
  });

  it('answers 401 to a caller with no token on every route that needs one', async () => {
    for (const r of routes.filter((x) => POLICY[key(x)] !== 'public')) {
      const res = await request(app)[r.method.toLowerCase()](r.path.replace(/:\w+/g, ID)).send({});
      expect({ route: key(r), status: res.status }).toEqual({ route: key(r), status: 401 });
    }
  });

  it('lets exactly the right roles through every route, and fails closed for the rest', async () => {
    const users = {
      student: await createUser({ role: 'student' }),
      teacher: await createUser({ role: 'teacher' }),
      teacher_applicant: await createUser({ role: 'teacher_applicant' }),
      admin: await createUser({ role: 'admin' }),
      suspended: await createUser({ role: 'student', suspendedAt: new Date() }),
    };
    const failures = [];
    for (const r of routes.filter((x) => POLICY[key(x)] !== 'public')) {
      const allowed = ALLOWED[POLICY[key(r)]];
      for (const actor of ACTORS) {
        const res = await request(app)[r.method.toLowerCase()](r.path.replace(/:\w+/g, ID))
          .set('Authorization', `Bearer ${users[actor].accessToken}`).send({});
        const passedGuard = res.status !== 401 && res.status !== 403;
        const shouldPass = allowed.includes(actor);
        if (passedGuard !== shouldPass) failures.push(`${key(r)} as ${actor}: expected ${shouldPass ? 'access' : 'denied'}, got ${res.status}`);
        if (!shouldPass && actor === 'teacher_applicant' && res.status === 403 && res.body.code !== 'TEACHER_PENDING' && POLICY[key(r)] !== 'student' && POLICY[key(r)] !== 'teacher') {
          failures.push(`${key(r)} as applicant: missing TEACHER_PENDING`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('gives a pending teacher TEACHER_PENDING, and a suspended account ACCOUNT_SUSPENDED, on every product route', async () => {
    const applicant = await createUser({ role: 'teacher_applicant' });
    const suspended = await createUser({ role: 'student', suspendedAt: new Date() });
    const a = await request(app).get('/problems').set('Authorization', `Bearer ${applicant.accessToken}`);
    expect([a.status, a.body.code]).toEqual([403, 'TEACHER_PENDING']);
    const s = await request(app).get('/problems').set('Authorization', `Bearer ${suspended.accessToken}`);
    expect([s.status, s.body.code]).toEqual([403, 'ACCOUNT_SUSPENDED']);
  });
});

describe('roles come from the database', () => {
  it('ends access at the next request when a teacher is demoted, with the same token', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const asTeacher = () => request(app).get('/answers?state=pending').set('Authorization', `Bearer ${teacher.accessToken}`);
    expect((await asTeacher()).status).toBe(200);
    await teacher.user.constructor.updateOne({ _id: teacher.user._id }, { $set: { role: 'student' } });
    expect((await asTeacher()).status).toBe(403);
  });
  it('ignores a role claim inside the token', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const student = await createUser({ role: 'student' });
    const forged = jwt.sign({ sub: String(student.user._id), role: 'teacher', tv: 0 }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
    const res = await request(app).get('/answers?state=pending').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(403);
    expect(jwt.decode(student.accessToken).role).toBeUndefined();
  });
});

describe('test helpers stay out of the application', () => {
  it('is never imported from application code', () => {
    const root = path.resolve(new URL('../..', import.meta.url).pathname);
    const folders = ['routes', 'services', 'middleware', 'models', 'utils', 'config', 'validation', 'constants'];
    const files = ['app.js', 'server.js', 'worker.js'];
    const collect = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? collect(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
    const sources = [...folders.flatMap((f) => collect(path.join(root, f))), ...files.map((f) => path.join(root, f))];
    const offenders = sources.filter((f) => /from\s+['"][^'"]*(tests\/helpers|\/helpers\/users|scripts\/)/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
