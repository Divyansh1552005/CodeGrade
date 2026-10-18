import mongoose from 'mongoose';

export const DOUBT_STATUS = ['pending_triage', 'pending_review', 'auto_rejected', 'appealed'];
export const REJECTED = 'auto_rejected';
export const PENDING_TRIAGE = 'pending_triage';

// What the triage model decided, kept for audit. Only teachers ever see `lowConfidence`.
const triageSchema = new mongoose.Schema({
  verdict: { type: String, enum: ['relevant', 'unrelated', 'spam_or_abusive', 'too_vague'] },
  confidence: { type: Number, min: 0, max: 1 },
  reason: String,
  model: String,
  lowConfidence: { type: Boolean, default: false },
  // 'ai' when the model answered, 'fallback' when triage failed open (timeout, outage, bad output, stuck).
  source: { type: String, enum: ['ai', 'fallback'] },
  error: String,
  decidedAt: Date,
}, { _id: false });

const doubtSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    // Optional context. The problem the doubt is about, and a code snippet.
    problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem' },
    code: { type: String },
    // Moderation state. Absent on doubts created before triage existed, and on
    // doubts created while triage is off. Absent counts as visible.
    status: { type: String, enum: DOUBT_STATUS },
    triage: { type: triageSchema, default: undefined },
    appeal: { type: new mongoose.Schema({ requestedAt: Date }, { _id: false }), default: undefined },
    // Set once the student has been told their doubt was removed (recovery re-sends it if missing).
    removalNotifiedAt: Date,
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
// Lets recovery find doubts stuck in triage without scanning the collection.
doubtSchema.index({ status: 1, createdAt: 1 });

// Default scope: an auto-rejected doubt is invisible to every read, populate() included,
// unless the query opts in with .setOptions({ includeRemoved: true }). Only the owner's
// "removed" page, the appeal, and the triage worker opt in. It is a deny-list ("not
// auto_rejected"), so doubts with no status stay visible.
function hideRemoved() {
  if (this.getOptions().includeRemoved) return;
  this.and([{ status: { $ne: REJECTED } }]);
}
doubtSchema.pre(['find', 'findOne', 'countDocuments', 'distinct'], hideRemoved);
doubtSchema.pre('aggregate', function hideRemovedInAggregate() {
  if (this.options?.includeRemoved) return;
  this.pipeline().unshift({ $match: { status: { $ne: REJECTED } } });
});

export default mongoose.model('Doubt', doubtSchema);
