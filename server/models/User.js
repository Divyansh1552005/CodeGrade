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
      enum: ['student', 'teacher'],
      required: true,
    },
  },
  { timestamps: true }
);

// Never leak the password hash when serializing to JSON.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
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

export default mongoose.model('User', userSchema);
