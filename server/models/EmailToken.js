import mongoose from 'mongoose';

export const EMAIL_TOKEN_TYPES = ['verify', 'reset'];

/**
 * One row per verification or reset link. The raw token is never stored: `tokenHash` is the SHA-256 of it.
 * `tokenId` is the random value the token is derived from (see services/emailTokens.js), so the worker can
 * rebuild the link when it sends the email. The rows also back the per-account cooldown and hourly cap, so
 * they are kept for a week past expiry before the TTL index removes them.
 */
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: EMAIL_TOKEN_TYPES, required: true },
  tokenId: { type: String, required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
  supersededAt: { type: Date },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ userId: 1, type: 1, createdAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export default mongoose.model('EmailToken', schema);
