import mongoose from 'mongoose';
// Immutable award input. Separate from the projection so a crash between the
// event and stats writes can be retried without losing or duplicating XP.
const schema = new mongoose.Schema({
  submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  xp: { type: Number, required: true },
  topics: [String],
  awardedAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ userId: 1, awardedAt: 1 });
export default mongoose.model('GamificationEvent', schema);
