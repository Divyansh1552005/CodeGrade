import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  submissionCount: { type: Number, default: 0 },
  solvedCount: { type: Number, default: 0 },
  solvedProblemIds: [mongoose.Schema.Types.ObjectId],
  passedTests: { type: Number, default: 0 },
  totalTests: { type: Number, default: 0 },
}, { timestamps: true });
export default mongoose.model('StudentStats', schema);
