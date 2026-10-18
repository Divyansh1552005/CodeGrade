import mongoose from 'mongoose';

// One hint conversation per student and problem. There is no thread id in any URL: a thread is
// always looked up by the signed-in user and the problem, so one student cannot reach another's.
const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  level: Number,
  // True when the reply was replaced by a safe built-in hint (it did not count as a hint given).
  fallback: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  messages: { type: [messageSchema], default: [] },
  // Real hints given on this problem. The next hint level is derived from it on the server.
  hintsUsed: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ userId: 1, problemId: 1 }, { unique: true });
export default mongoose.model('HintThread', schema);
