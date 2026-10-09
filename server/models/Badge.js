import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  icon: String,
  rule: { metric: { type: String, enum: ['solvedCount', 'longestStreak', 'level'], required: true }, threshold: { type: Number, required: true, min: 1 } },
}, { timestamps: true });
export default mongoose.model('Badge', schema);
