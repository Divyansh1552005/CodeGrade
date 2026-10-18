import mongoose from 'mongoose';

// One document per user holding every hint-chat limit, so all of them can be checked and
// updated in a single atomic operation (see services/hintQuota.js). The schema documents
// the shape; the service writes through the raw collection with update pipelines.
//   day        Asia/Kolkata day the daily counters belong to; they reset when it changes
//   messages   user messages counted today (one daily total across all problems)
//   recent     epoch ms of recent messages, for the rolling per-minute limit
//   refunds    refunds given today (capped)
//   ledger     one entry per reserved message, so a refund can happen only once
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  day: String,
  messages: { type: Number, default: 0 },
  recent: [Number],
  refunds: { type: Number, default: 0 },
  ledger: [{
    _id: false,
    id: mongoose.Schema.Types.ObjectId,
    problemId: mongoose.Schema.Types.ObjectId,
    tookSlot: Boolean,
    at: Number,
    day: String,
    refunded: Boolean,
  }],
  expiresAt: Date,
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('HintQuota', schema);
