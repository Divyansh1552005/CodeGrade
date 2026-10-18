import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import User from '../../models/User.js';
import Doubt from '../../models/Doubt.js';
import Answer from '../../models/Answer.js';
import { legacyTeacherReport, toCsv } from '../../scripts/legacyTeachers.js';
import { createUser } from '../helpers/users.js';

async function approvedAnswer(teacher, content = 'A') {
  const student = await createUser({ role: 'student' });
  const doubt = await Doubt.create({ studentId: student.user._id, title: 'Q', body: 'B' });
  const answer = await Answer.create({ doubtId: doubt._id, content, source: 'teacher', state: 'pending' });
  await Answer.updateOne({ _id: answer._id }, { $set: { state: 'approved', reviewedBy: teacher.user._id, reviewedAt: new Date() } });
  return answer;
}

describe('legacy teacher report', () => {
  it('lists teachers that were never approved, with their approved answers, and ignores everyone else', async () => {
    const legacy = await createUser({ role: 'teacher', email: 'old@school.example', emailVerified: undefined });
    await createUser({ role: 'teacher', teacherApprovedAt: new Date() });
    await createUser({ role: 'student' });
    await createUser({ role: 'teacher_applicant' });
    await approvedAnswer(legacy);
    await approvedAnswer(legacy);
    const { teachers, answers } = await legacyTeacherReport();
    expect(teachers).toHaveLength(1);
    expect(teachers[0]).toMatchObject({ email: 'old@school.example', approvedAnswers: 2, emailVerified: true });
    expect(answers).toHaveLength(2);
    expect(answers[0].teacherEmail).toBe('old@school.example');
  });
  it('changes nothing: no role, no flag, no answer', async () => {
    const legacy = await createUser({ role: 'teacher' });
    await approvedAnswer(legacy);
    const snapshot = async () => JSON.stringify([await User.find().sort({ _id: 1 }).lean(), await Answer.find().sort({ _id: 1 }).lean()]);
    const before = await snapshot();
    await legacyTeacherReport();
    expect(await snapshot()).toBe(before);
    expect((await User.findById(legacy.user._id)).role).toBe('teacher');
  });
  it('writes a CSV that a spreadsheet cannot run as a formula', () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'plain, with comma', c: '+1' }], ['a', 'b', 'c']);
    expect(csv).toBe('a,b,c\n"\'=HYPERLINK(""x"")","plain, with comma",\'+1\n');
  });
  it('can be imported without running, and refuses to run without a database', () => {
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', "await import('./scripts/legacyTeachers.js'); console.log('imported');"], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } }).trim()).toBe('imported');
    let failure;
    try { execFileSync(process.execPath, ['scripts/legacyTeachers.js'], { encoding: 'utf8', stdio: 'pipe', env: { PATH: process.env.PATH, MONGODB_URI: '' } }); } catch (err) { failure = err; }
    expect(failure.stderr).toMatch(/MONGODB_URI is not set/);
  });
});
