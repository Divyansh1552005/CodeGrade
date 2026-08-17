import mongoose from 'mongoose';

const doubtSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    // Tracks the outcome of the AI draft generation for this doubt.
    aiDraftStatus: {
      type: String,
      enum: ['pending', 'success', 'failed', 'irrelevant'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Doubt', doubtSchema);
