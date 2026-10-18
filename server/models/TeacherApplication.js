import mongoose from 'mongoose';

export const APPLICATION_STATUSES = ['pending', 'approved', 'rejected'];

/**
 * A request to become a teacher. All text is plain text typed by an untrusted user: it is length-limited here,
 * cleaned on the way in, and only ever shown as text. `visibleAt` is set when the applicant verifies their
 * email, and the admin queue only lists applications that have it, so unverified (possibly fake) addresses
 * never reach the admin. `decisionSeq` counts decisions, so each approval or rejection email has its own key.
 */
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  status: { type: String, enum: APPLICATION_STATUSES, default: 'pending' },
  organization: { type: String, required: true, maxlength: 120 },
  note: { type: String, maxlength: 500, default: '' },
  // Proof of qualification, as links only (no uploads). Optional in the schema because older applications have none.
  degree: { type: String, maxlength: 120, default: '' },
  degreeLink: { type: String, maxlength: 500, default: '' },
  proofLinks: { type: [{ type: String, maxlength: 500 }], default: [], validate: (v) => v.length <= 3 },
  visibleAt: { type: Date },
  decidedAt: { type: Date },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decisionReason: { type: String, maxlength: 240 },
  decisionSeq: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ status: 1, visibleAt: -1, _id: -1 });
schema.index({ status: 1, createdAt: -1, _id: -1 });

export default mongoose.model('TeacherApplication', schema);
