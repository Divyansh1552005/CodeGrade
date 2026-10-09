import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastSolvedDate: Date,
  solvedCount: { type: Number, default: 0 },
  eventCount: { type: Number, default: 0 },
  topicXp: [{ _id: false, topic: String, xp: Number }],
}, { timestamps: true });
schema.index({ xp: -1, solvedCount: -1, userId: 1 });
schema.index({ 'topicXp.topic': 1 });
export default mongoose.model('UserStats', schema);
