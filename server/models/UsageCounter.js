import mongoose from 'mongoose';

// One counter per user, kind and Asia/Kolkata day. Used for per-day caps (for example
// doubts created). Rows expire on their own a few days after the day they count.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, required: true },
  day: { type: String, required: true },
  count: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, required: true },
});
schema.index({ userId: 1, kind: 1, day: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('UsageCounter', schema);
