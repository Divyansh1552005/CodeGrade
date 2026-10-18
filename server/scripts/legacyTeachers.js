// Read-only report on "legacy" teachers: accounts that hold the teacher role but were never approved through
// the application flow (no teacherApprovedAt), which includes anyone who registered as a teacher before
// signup was locked down. It NEVER changes a role or anything else: it only reads, prints to the terminal
// (full emails, so you can recognise people) and, with --csv=FILE, writes the answers those teachers approved
// to a file for review. Review the list, then demote the accounts you do not recognise on the admin Users page.
//
//   node scripts/legacyTeachers.js
//   node scripts/legacyTeachers.js --csv=legacy-approved-answers.csv
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Answer from '../models/Answer.js';

/** { teachers, answers }: every legacy teacher with how many answers they approved, and those answers. */
export async function legacyTeacherReport() {
  const teachers = await User.find({ role: 'teacher', teacherApprovedAt: { $exists: false } }).select('name email createdAt emailVerified').sort({ createdAt: 1 }).lean();
  const ids = teachers.map((t) => t._id);
  const answers = ids.length
    ? await Answer.find({ state: 'approved', reviewedBy: { $in: ids } }).select('doubtId reviewedBy reviewedAt source createdAt').sort({ reviewedAt: 1 }).lean()
    : [];
  const perTeacher = new Map();
  for (const answer of answers) perTeacher.set(String(answer.reviewedBy), (perTeacher.get(String(answer.reviewedBy)) ?? 0) + 1);
  const byId = new Map(teachers.map((t) => [String(t._id), t]));
  return {
    teachers: teachers.map((t) => ({
      id: String(t._id), name: t.name, email: t.email, createdAt: t.createdAt, emailVerified: t.emailVerified !== false, approvedAnswers: perTeacher.get(String(t._id)) ?? 0,
    })),
    answers: answers.map((a) => ({
      answerId: String(a._id), doubtId: String(a.doubtId), teacherEmail: byId.get(String(a.reviewedBy))?.email ?? '', approvedAt: a.reviewedAt ?? a.createdAt, source: a.source,
    })),
  };
}

// A cell that starts with = + - or @ would run as a formula in a spreadsheet, so it is prefixed with a quote.
const cell = (value) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (rows, columns) => [columns.join(','), ...rows.map((row) => columns.map((c) => cell(row[c])).join(','))].join('\n') + '\n';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'), quiet: true });
  try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
    await mongoose.connect(process.env.MONGODB_URI);
    const { teachers, answers } = await legacyTeacherReport();
    console.log(`Read-only report on "${mongoose.connection.name}". Nothing is changed.\n`);
    console.log(`${teachers.length} legacy teacher(s) (teacher role, never approved through the application flow):`);
    for (const t of teachers) console.log(`  ${t.email}\t${t.name}\tcreated ${new Date(t.createdAt).toISOString().slice(0, 10)}\tverified ${t.emailVerified ? 'yes' : 'no'}\tapproved answers ${t.approvedAnswers}`);
    console.log(`\n${answers.length} answer(s) approved by legacy teachers.`);
    const csv = (process.argv.find((a) => a.startsWith('--csv=')) || '').slice('--csv='.length);
    if (csv) {
      fs.writeFileSync(csv, toCsv(answers, ['answerId', 'doubtId', 'teacherEmail', 'approvedAt', 'source']), { mode: 0o600 });
      console.log(`Wrote them to ${csv}.`);
    } else if (answers.length) console.log('Pass --csv=FILE to write them to a file.');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
