import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  badgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge', required: true },
  awardedAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.index({ userId: 1, badgeId: 1 }, { unique: true });
export default mongoose.model('UserBadge', schema);
