// Measures the Profile list queries against a seeded in-memory MongoDB: response times and payload size
// of the HTTP routes, and explain(executionStats) of the queries behind them.
//
//   node scripts/perf/profileBench.js [--submissions=5000] [--doubts=3000]
//
// Self-contained (starts its own mongodb-memory-server), so it never touches a real database.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { assertSafeDatabase, seedProfileData } from './seedProfileData.js';
import { encodeCursor } from '../../utils/pagination.js';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'bench-access';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'bench-refresh';
// Few runs per route: the general per-user rate limit (120 a minute) applies to the bench too.
const RUNS = 7;
const arg = (name, fallback) => Number((process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] ?? fallback);

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri(), { dbName: 'profile-bench-test' });
assertSafeDatabase(mongoose.connection.name);
const { createApp } = await import('../../app.js');
const { default: Submission } = await import('../../models/Submission.js');
const { default: Doubt } = await import('../../models/Doubt.js');

const seeded = await seedProfileData({ submissions: arg('submissions', 5000), doubts: arg('doubts', 3000) });
const app = createApp();
const token = (user) => jwt.sign({ sub: String(user._id) }, process.env.JWT_ACCESS_SECRET, { expiresIn: '1h' });
const student = { Authorization: `Bearer ${token(seeded.heavy)}` };
const teacher = { Authorization: `Bearer ${token(seeded.teacher)}` };

async function time(label, url, headers) {
  const runs = [];
  let bytes = 0;
  let status = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const start = process.hrtime.bigint();
    const res = await request(app).get(url).set(headers);
    runs.push(Number(process.hrtime.bigint() - start) / 1e6);
    bytes = JSON.stringify(res.body).length;
    status = res.status;
  }
  runs.sort((a, b) => a - b);
  console.log(`${label.padEnd(44)} ${String(status).padEnd(4)} median=${String(Math.round(runs[3])).padStart(4)}ms  p95~${String(Math.round(runs[5])).padStart(4)}ms  payload=${(bytes / 1024).toFixed(1)}KB`);
  return JSON.parse(JSON.stringify((await request(app).get(url).set(headers)).body));
}
async function explain(label, query) {
  const e = await query.explain('executionStats');
  const s = e.executionStats;
  const stages = JSON.stringify(e.queryPlanner.winningPlan).match(/"stage":"[A-Z_]+"/g).map((x) => x.slice(9, -1)).join('>');
  console.log(`${label.padEnd(52)} ${stages.padEnd(34)} returned=${String(s.nReturned).padStart(3)} keys=${String(s.totalKeysExamined).padStart(5)} docs=${String(s.totalDocsExamined).padStart(5)} ${s.executionTimeMillis}ms`);
}

console.log(`\nSeeded ${seeded.counts.submissions} submissions and ${seeded.counts.doubts} doubts (${seeded.counts.rejected} auto_rejected) for the student, plus other users.\n`);
console.log('--- HTTP routes (median of 7)');
await time('GET /submissions (first page, 10)', '/submissions', student);
await time('GET /submissions?limit=50', '/submissions?limit=50', student);
const first = await time('GET /submissions?limit=10 (page for cursor)', '/submissions?limit=10', student);
const deepRow = (await Submission.find({ studentId: seeded.heavy._id }).sort({ createdAt: -1, _id: -1 }).skip(Math.max(0, seeded.counts.submissions - 20)).limit(1).lean())[0];
await time('GET /submissions deep page (~20 rows from the end)', `/submissions?limit=10&cursor=${encodeCursor(deepRow)}`, student);
await time('GET /submissions?problemId= (one problem)', `/submissions?problemId=${seeded.problems[3]._id}`, student);
await time('GET /submissions as teacher (all, first page)', '/submissions', teacher);
await time('GET /doubts?mine=1 (first page, 10)', '/doubts?mine=1', student);
const deepDoubt = (await Doubt.find({ studentId: seeded.heavy._id }).sort({ createdAt: -1, _id: -1 }).setOptions({ includeRemoved: true }).skip(Math.max(0, seeded.counts.doubts - 20)).limit(1).lean())[0];
await time('GET /doubts?mine=1 deep page (~20 from the end)', `/doubts?mine=1&limit=10&cursor=${encodeCursor(deepDoubt)}`, student);
await time('GET /doubts (board, first page)', '/doubts?limit=20', student);

console.log('\n--- explain(executionStats)');
const sid = seeded.heavy._id;
const sort = { createdAt: -1, _id: -1 };
const oldIndex = { studentId: 1, problemId: 1 };
await explain('BEFORE student list (old index, no limit)', Submission.find({ studentId: sid }).sort({ createdAt: -1 }).hint(oldIndex));
await explain('BEFORE student list, limit 11 (old index)', Submission.find({ studentId: sid }).sort(sort).limit(11).hint(oldIndex));
await explain('AFTER  student list, limit 11', Submission.find({ studentId: sid }).sort(sort).limit(11));
await explain('AFTER  student list for one problem, limit 11', Submission.find({ studentId: sid, problemId: seeded.problems[3]._id }).sort(sort).limit(11));
await explain('BEFORE teacher list (no usable index, scan+sort)', Submission.find({}).sort(sort).limit(11).hint({ $natural: 1 }));
await explain('AFTER  teacher list, limit 11', Submission.find({}).sort(sort).limit(11));
await explain('AFTER  teacher list for one problem, limit 11', Submission.find({ problemId: seeded.problems[3]._id }).sort(sort).limit(11));
await explain('doubts: mine, limit 11 (visibility rule applied)', Doubt.find({ $and: [{ studentId: sid }, { status: { $ne: 'pending_triage' } }] }).sort(sort).limit(11));

await mongoose.disconnect();
await mongo.stop();
