// Seeds realistic data for the Profile page lists (one heavy user with thousands of submissions and
// doubts, plus other users' noise), so list performance can be measured. The backend optimisation
// phase can reuse it.
//
//   node scripts/perf/seedProfileData.js [--submissions=5000] [--doubts=3000] [--noise-submissions=20000]
//
// It refuses to run in production, and unless the database name contains "test", "local" or "dev".
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/** Throws unless it is safe to write bulk test data into this database. */
export function assertSafeDatabase(dbName, env = process.env) {
  if (String(env.NODE_ENV).toLowerCase() === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production.');
  }
  if (!/(test|local|dev)/i.test(String(dbName || ''))) {
    throw new Error(`Refusing to seed database "${dbName}": its name must contain "test", "local" or "dev".`);
  }
}

const CODE = `def solve():\n${'    value = input()\n'.repeat(80)}`;
const DOUBT_BODY = 'This is the body of a doubt with some detail about what was tried. '.repeat(40);

/**
 * Inserts problems, a heavy student, a teacher and noise students with raw bulk inserts.
 * Every `rejectedEvery`-th doubt of the heavy student is auto_rejected, so visibility rules are exercised.
 */
export async function seedProfileData({
  submissions = 5000, doubts = 3000, noiseUsers = 20, noiseSubmissions = 20000, noiseDoubts = 10000, problemCount = 50, rejectedEvery = 7,
} = {}) {
  const [{ default: User }, { default: Problem }, { default: Submission }, { default: Doubt }] = await Promise.all([
    import('../../models/User.js'), import('../../models/Problem.js'), import('../../models/Submission.js'), import('../../models/Doubt.js'),
  ]);
  await Promise.all([Submission.init(), Doubt.init()]);
  const passwordHash = await bcrypt.hash('password123', 4);
  const heavy = await User.create({ name: 'Perf Student', email: `perf-student-${Date.now()}@example.test`, passwordHash, role: 'student' });
  const teacher = await User.create({ name: 'Perf Teacher', email: `perf-teacher-${Date.now()}@example.test`, passwordHash, role: 'teacher' });
  const noise = await User.insertMany(Array.from({ length: noiseUsers }, (_, i) => ({ name: `Noise ${i}`, email: `noise-${i}-${Date.now()}@example.test`, passwordHash, role: 'student' })));
  const problems = await Problem.insertMany(Array.from({ length: problemCount }, (_, i) => ({ title: `Perf problem ${i}`, topics: ['Arrays'], difficulty: ['easy', 'medium', 'hard'][i % 3] })));

  const now = Date.now();
  const submission = (studentId, i) => ({
    studentId, problemId: problems[i % problems.length]._id, code: CODE, language: 'python', status: 'graded', passCount: i % 4, totalCount: 3,
    feedbackStatus: 'completed',
    testResults: Array.from({ length: 5 }, (_, k) => ({ input: 'in'.repeat(40), expectedOutput: 'out'.repeat(20), actualOutput: 'out'.repeat(20), passed: k % 2 === 0 })),
    aiFeedback: { summary: 'S'.repeat(400), strengths: ['a'.repeat(120)], improvements: ['b'.repeat(120)], complexityNote: 'O(n)' },
    createdAt: new Date(now - i * 60000), updatedAt: new Date(now - i * 60000),
  });
  const doubt = (studentId, i, rejected) => ({
    studentId, title: `Perf doubt ${i}`, body: DOUBT_BODY, status: rejected ? 'auto_rejected' : 'pending_review', aiDraftStatus: 'success',
    createdAt: new Date(now - i * 60000), updatedAt: new Date(now - i * 60000),
  });
  const chunked = async (collection, total, make) => {
    for (let start = 0; start < total; start += 2000) {
      await collection.insertMany(Array.from({ length: Math.min(2000, total - start) }, (_, k) => make(start + k)));
    }
  };
  await chunked(Submission.collection, submissions, (i) => submission(heavy._id, i));
  await chunked(Doubt.collection, doubts, (i) => doubt(heavy._id, i, rejectedEvery > 0 && i % rejectedEvery === 3));
  await chunked(Submission.collection, noiseSubmissions, (i) => submission(noise[i % noise.length]._id, i));
  await chunked(Doubt.collection, noiseDoubts, (i) => doubt(noise[i % noise.length]._id, i, false));
  return { heavy, teacher, problems, counts: { submissions, doubts, rejected: rejectedEvery > 0 ? Math.floor((doubts + rejectedEvery - 4) / rejectedEvery) : 0 } };
}

// ---- command line ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });
  const arg = (name, fallback) => Number((process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] ?? fallback);
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    assertSafeDatabase(mongoose.connection.name);
    const result = await seedProfileData({ submissions: arg('submissions', 5000), doubts: arg('doubts', 3000), noiseSubmissions: arg('noise-submissions', 20000), noiseDoubts: arg('noise-doubts', 10000) });
    console.log(`Seeded database "${mongoose.connection.name}". Heavy student: ${result.heavy.email} (password: password123)`, result.counts);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
