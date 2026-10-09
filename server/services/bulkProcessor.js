import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import WorkItem from '../models/WorkItem.js';
import { createProblemSchema } from '../validation/schemas.js';

export async function processBulk(work) {
  if (work.type === 'problem-import') {
    // Validate the entire batch before writing any rows, also on worker replay.
    const problems = work.payload.problems.map((p) => createProblemSchema.parse(p));
    const ids = [];
    for (const [index, values] of problems.entries()) {
      const importKey = `${work.id}-${index}`;
      let problem;
      try {
        problem = await Problem.findOneAndUpdate({ importKey },
          { $setOnInsert: { ...values, importKey, createdBy: work.ownerId } },
          { upsert: true, new: true, runValidators: true });
      } catch (err) {
        if (err.code !== 11000) throw err;
        problem = await Problem.findOne({ importKey });
      }
      ids.push(problem.id);
      await WorkItem.updateOne({ _id: work.id }, { $set: { result: { importedCount: ids.length, totalCount: problems.length } } });
    }
    return { importedCount: ids.length, problemIds: ids };
  }
  const problems = [];
  let bytes = 0;
  const cursor = Problem.find({ createdBy: work.ownerId }).sort({ _id: 1 }).lean().cursor();
  try {
    for await (const problem of cursor) {
      if (problems.length >= 1000) throw new Error('Export exceeds 1000 problems. Use a smaller problem bank.');
      const { _id, createdBy, createdAt, updatedAt, __v, importKey, ...values } = problem;
      const row = work.type === 'problem-export' ? values : { problemId: _id, title: values.title, archived: values.archived };
      bytes += Buffer.byteLength(JSON.stringify(row));
      if (bytes > 8 * 1024 * 1024) throw new Error('Export exceeds the 8 MB result limit.');
      problems.push(row);
    }
  } finally { await cursor.close(); }
  if (work.type === 'problem-export') return { problems };
  const ids = problems.map((p) => p.problemId);
  const totals = await Submission.aggregate([
    { $match: { problemId: { $in: ids } } },
    { $group: { _id: '$problemId', submissions: { $sum: 1 },
      graded: { $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] } },
      errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
      allPassed: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'graded'] },
        { $gt: ['$totalCount', 0] }, { $eq: ['$passCount', '$totalCount'] }] }, 1, 0] } },
    } },
  ]);
  const byId = new Map(totals.map((t) => [String(t._id), t]));
  return { generatedAt: new Date().toISOString(), problems: problems.map((p) => {
    const { _id, ...counts } = byId.get(String(p.problemId)) ?? { submissions: 0, graded: 0, errors: 0, allPassed: 0 };
    return { ...p, ...counts };
  }) };
}
