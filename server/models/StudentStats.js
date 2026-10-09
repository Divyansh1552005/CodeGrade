import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  submissionCount: { type: Number, default: 0 },
  solvedCount: { type: Number, default: 0 },
  solvedProblemIds: [mongoose.Schema.Types.ObjectId],
  passedTests: { type: Number, default: 0 },
  totalTests: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  activityDays: [String],
  longestStreak: { type: Number, default: 0 },
  achievements: [String],
}, { timestamps: true });
schema.index({ xp: -1, solvedCount: -1, studentId: 1 });
export default mongoose.model('StudentStats', schema);
