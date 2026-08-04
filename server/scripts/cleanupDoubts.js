import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Doubt from '../models/Doubt.js';
import Answer from '../models/Answer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * One-off maintenance: remove leftover test doubts.
 *  1. Doubts authored by a non-student (e.g. a teacher account) — these should
 *     never exist now that POST /doubts is student-only; they are stale data
 *     from before that guard existed.
 *  2. Near-duplicate doubts: same author + same title, keep the earliest.
 * Also deletes any answers attached to the removed doubts.
 */
async function cleanup() {
  await connectDB();

  const toDelete = new Set();

  // 1) Non-student-authored doubts.
  const nonStudents = await User.find({ role: { $ne: 'student' } }).select('_id name role');
  const nonStudentIds = nonStudents.map((u) => u._id.toString());
  const teacherDoubts = await Doubt.find({ studentId: { $in: nonStudentIds } }).populate(
    'studentId',
    'name role'
  );
  for (const d of teacherDoubts) {
    console.log(`Removing non-student doubt: "${d.title}" by ${d.studentId?.name} (${d.studentId?.role})`);
    toDelete.add(d._id.toString());
  }

  // 2) Duplicate (author + title), keep earliest.
  const all = await Doubt.find().sort({ createdAt: 1 });
  const seen = new Map();
  for (const d of all) {
    const key = `${d.studentId}::${d.title.trim().toLowerCase()}`;
    if (seen.has(key)) {
      console.log(`Removing duplicate doubt: "${d.title}" (${d._id})`);
      toDelete.add(d._id.toString());
    } else {
      seen.set(key, d._id.toString());
    }
  }

  const ids = [...toDelete].map((id) => new mongoose.Types.ObjectId(id));
  if (ids.length === 0) {
    console.log('Nothing to clean up.');
  } else {
    const ans = await Answer.deleteMany({ doubtId: { $in: ids } });
    const del = await Doubt.deleteMany({ _id: { $in: ids } });
    console.log(`\nDeleted ${del.deletedCount} doubts and ${ans.deletedCount} attached answers.`);
  }

  const remaining = await Doubt.countDocuments();
  console.log(`Remaining doubts: ${remaining}`);

  await mongoose.disconnect();
}

cleanup().catch((err) => {
  console.error(err);
  process.exit(1);
});
