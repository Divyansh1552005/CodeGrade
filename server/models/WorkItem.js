import mongoose from 'mongoose';

export const WORK_TYPES = ['grading', 'doubt-draft', 'feedback', 'completion', 'notification', 'problem-import', 'problem-export', 'report-export'];
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  type: { type: String, enum: WORK_TYPES, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'queued', 'running', 'completed', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  error: String,
  result: mongoose.Schema.Types.Mixed,
  finishedAt: Date,
}, { timestamps: true });
schema.index({ status: 1, createdAt: 1 });
schema.index({ ownerId: 1, type: 1, createdAt: -1 });
export default mongoose.model('WorkItem', schema);
