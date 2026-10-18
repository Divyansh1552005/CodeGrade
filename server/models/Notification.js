import mongoose from 'mongoose';

// In-app notifications. `message` and `href` are the original fields (the dashboard
// and /activity/notifications still read them). New notifications also carry a type,
// title and body, and expire after `expiresAt` (a TTL index). Rows created before
// this change have no expiresAt and are kept.
const schema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String },
  title: { type: String },
  body: { type: String },
  message: { type: String, required: true },
  href: { type: String, required: true },
  readAt: Date,
  expiresAt: Date,
}, { timestamps: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, readAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('Notification', schema);
