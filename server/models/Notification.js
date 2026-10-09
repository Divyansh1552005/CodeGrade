import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  href: { type: String, required: true },
  readAt: Date,
}, { timestamps: true });
schema.index({ userId: 1, createdAt: -1 });
export default mongoose.model('Notification', schema);
