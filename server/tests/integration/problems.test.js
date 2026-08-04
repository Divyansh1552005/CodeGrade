import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import Submission from '../../models/Submission.js';
import Problem from '../../models/Problem.js';

const app = createApp();

async function register(role) {
  const res = await request(app).post('/auth/register').send({
    name: role,
    email: `${role}${Math.random()}@x.com`,
    password: 'password123',
    role,
  });
  return { token: res.body.accessToken, userId: res.body.user._id };
}

const validBody = () => ({
  title: 'Double it',
  description: 'Read n, print 2n.',
  inputFormat: 'A single integer n.',
  outputFormat: 'A single integer 2n.',
  constraints: '-10^9 <= n <= 10^9',
  sampleCases: [{ input: '2', output: '4', explanation: '2 doubled is 4.' }],
  starterCode: { python: 'n = int(input())', java: '' },
  testCases: [
    { input: '2', expectedOutput: '4' },
    { input: '5', expectedOutput: '10' },
  ],
});

let teacher;
let student;

beforeEach(async () => {
  teacher = await register('teacher');
  student = await register('student');
});

describe('POST /problems', () => {
  it('lets a teacher create a problem (201) and it appears in GET /problems', async () => {
    const create = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send(validBody());
    expect(create.status).toBe(201);
    expect(create.body.problem.title).toBe('Double it');
    expect(create.body.problem.createdBy).toBe(teacher.userId);
    // Language-agnostic: no `language` field; starterCode is keyed by language.
    expect(create.body.problem.language).toBeUndefined();
    expect(create.body.problem.starterCode.python).toBe('n = int(input())');

    const list = await request(app)
      .get('/problems')
      .set('Authorization', `Bearer ${student.token}`);
    expect(list.status).toBe(200);
    const found = list.body.problems.find((p) => p._id === create.body.problem._id);
    expect(found).toBeTruthy();
  });

  it('forbids a student from creating a problem (403)', async () => {
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${student.token}`)
      .send(validBody());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/teacher/i);
  });

  it('rejects a missing testCases array (400)', async () => {
    const body = validBody();
    delete body.testCases;
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/testCases must be a non-empty array/i);
  });

  it('rejects an empty testCases array (400)', async () => {
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ ...validBody(), testCases: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty array/i);
  });

  it('rejects a testCase missing expectedOutput (400)', async () => {
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ ...validBody(), testCases: [{ input: '2' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/input.*expectedOutput|expectedOutput/i);
  });

  it('persists the statement sections', async () => {
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send(validBody());
    expect(res.status).toBe(201);
    expect(res.body.problem.inputFormat).toBe('A single integer n.');
    expect(res.body.problem.outputFormat).toBe('A single integer 2n.');
    expect(res.body.problem.constraints).toBe('-10^9 <= n <= 10^9');
    expect(res.body.problem.sampleCases).toEqual([
      { input: '2', output: '4', explanation: '2 doubled is 4.' },
    ]);
  });

  it.each(['inputFormat', 'outputFormat', 'constraints'])(
    'rejects a missing %s (400)',
    async (field) => {
      const body = validBody();
      delete body[field];
      const res = await request(app)
        .post('/problems')
        .set('Authorization', `Bearer ${teacher.token}`)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(new RegExp(`${field} is required`, 'i'));
    }
  );

  it.each(['inputFormat', 'outputFormat', 'constraints'])(
    'rejects a whitespace-only %s (400)',
    async (field) => {
      const res = await request(app)
        .post('/problems')
        .set('Authorization', `Bearer ${teacher.token}`)
        .send({ ...validBody(), [field]: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(new RegExp(`${field} is required`, 'i'));
    }
  );

  it('rejects missing sampleCases (400)', async () => {
    const body = validBody();
    delete body.sampleCases;
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sampleCases must be a non-empty array/i);
  });

  it('rejects a sample case without an output (400)', async () => {
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ ...validBody(), sampleCases: [{ input: '2', output: '  ' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sampleCases\[0\].*output/i);
  });

  it('rejects missing description (400)', async () => {
    const body = validBody();
    delete body.description;
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title and description/i);
  });
});

describe('PATCH /problems/:id (teacher-only, creator-only)', () => {
  async function createProblem(token) {
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody());
    return res.body.problem;
  }

  it('lets the creating teacher edit their problem', async () => {
    const problem = await createProblem(teacher.token);
    const res = await request(app)
      .patch(`/problems/${problem._id}`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ title: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.problem.title).toBe('Renamed');
  });

  it('updates the statement sections', async () => {
    const problem = await createProblem(teacher.token);
    const res = await request(app)
      .patch(`/problems/${problem._id}`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({
        constraints: '1 <= n <= 10',
        sampleCases: [{ input: '3', output: '6' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.problem.constraints).toBe('1 <= n <= 10');
    expect(res.body.problem.sampleCases).toEqual([
      { input: '3', output: '6', explanation: '' },
    ]);
  });

  it('refuses to blank out a mandatory section (400)', async () => {
    const problem = await createProblem(teacher.token);
    const res = await request(app)
      .patch(`/problems/${problem._id}`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ inputFormat: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inputFormat is required/i);
  });

  it('forbids a different teacher from editing (403)', async () => {
    const problem = await createProblem(teacher.token);
    const otherTeacher = await register('teacher');
    const res = await request(app)
      .patch(`/problems/${problem._id}`)
      .set('Authorization', `Bearer ${otherTeacher.token}`)
      .send({ title: 'Hijack' });
    expect(res.status).toBe(403);
  });

  it('forbids a student from editing (403)', async () => {
    const problem = await createProblem(teacher.token);
    const res = await request(app)
      .patch(`/problems/${problem._id}`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ title: 'Nope' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /problems/:id (soft-delete when referenced)', () => {
  async function createProblem() {
    const res = await request(app)
      .post('/problems')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send(validBody());
    return res.body.problem;
  }

  it('hard-deletes a problem with no submissions', async () => {
    const problem = await createProblem();
    const res = await request(app)
      .delete(`/problems/${problem._id}`)
      .set('Authorization', `Bearer ${teacher.token}`);
    expect(res.status).toBe(200);
    expect(res.body.softDeleted).toBe(false);
    expect(await Problem.findById(problem._id)).toBeNull();
  });

  it('soft-deletes (archives) a problem referenced by a submission, preserving history', async () => {
    const problem = await createProblem();
    await Submission.create({
      studentId: student.userId,
      problemId: problem._id,
      code: 'x',
      language: 'python',
      status: 'graded',
    });

    const res = await request(app)
      .delete(`/problems/${problem._id}`)
      .set('Authorization', `Bearer ${teacher.token}`);
    expect(res.status).toBe(200);
    expect(res.body.softDeleted).toBe(true);

    // Still in the DB (history intact) but hidden from the list.
    const stillThere = await Problem.findById(problem._id);
    expect(stillThere.archived).toBe(true);
    const list = await request(app)
      .get('/problems')
      .set('Authorization', `Bearer ${student.token}`);
    expect(list.body.problems.find((p) => p._id === problem._id)).toBeUndefined();
  });
});
