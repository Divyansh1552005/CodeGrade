import mongoose from 'mongoose';

/**
 * Refresh tokens are stored server-side (hashed) so they can be rotated and
 * revoked. The raw token is only ever returned to the client once, at issue
 * time; we keep only its SHA-256 hash.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

// TTL index: Mongo auto-purges expired documents.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RefreshToken', refreshTokenSchema);
