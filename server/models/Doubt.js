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
    aiDraftError: String,
    // Tracks the outcome of the AI draft generation for this doubt.
    aiDraftStatus: {
      type: String,
      enum: ['pending', 'success', 'failed', 'irrelevant'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Supports the shared board's descending keyset page and the same ordering
// within one student's own doubts.
doubtSchema.index({ createdAt: -1, _id: -1 });
doubtSchema.index({ studentId: 1, createdAt: -1, _id: -1 });

export default mongoose.model('Doubt', doubtSchema);
