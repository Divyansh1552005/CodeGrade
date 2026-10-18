import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['student', 'teacher', 'admin', 'teacher_applicant'],
      required: true,
    },
    // Marks the single account that ADMIN_EMAIL/ADMIN_PASSWORD manage (see services/adminBootstrap.js).
    envAdmin: { type: Boolean },
    // Set when an admin approves a teacher or promotes a user to teacher. A teacher without it is a legacy
    // teacher, from before approval existed.
    teacherApprovedAt: { type: Date },
    suspendedAt: { type: Date },
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastLoginAt: { type: Date },
    // No schema default on purpose: a user document written before email verification existed has no
    // field, and a default of false would lock them out. Use isVerified(), which reads a missing field as verified.
    emailVerified: { type: Boolean },
    emailVerifiedAt: { type: Date },
    // Raised when the password is reset. Access and refresh tokens carry it, so older ones stop working.
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Never leak the password hash when serializing to JSON.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.tokenVersion;
    delete ret.envAdmin;
    delete ret.suspendedBy;
    delete ret.__v;
    return ret;
  },
});

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
};

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// At most one user can be the env admin.
userSchema.index({ envAdmin: 1 }, { unique: true, partialFilterExpression: { envAdmin: true } });
// Admin user list: newest first, filtered by role.
userSchema.index({ role: 1, createdAt: -1, _id: -1 });

/** Only an explicit false is unverified: legacy accounts, and accounts created with the feature off, have no value. */
export const isVerified = (user) => user.emailVerified !== false;

export default mongoose.model('User', userSchema);
