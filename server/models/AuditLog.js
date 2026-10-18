import mongoose from 'mongoose';

export const AUDIT_ACTIONS = [
  'admin.bootstrapped', 'admin.password_changed', 'admin.demoted', 'admin.login_failed', 'admin.login',
  'teacher_application.submitted', 'teacher_application.verified', 'teacher_application.approved', 'teacher_application.rejected',
  'role.changed', 'user.suspended', 'user.unsuspended',
];

/**
 * Append-only record of security-relevant events. Rows are only ever inserted: the model refuses updates,
 * replacements and deletes (queries and documents), there is no route that edits or removes a row, and the
 * service layer only exposes `audit()`. The single exception is the counter on a coalesced failure row
 * (see services/audit.js), which only increments `count`.
 * Nothing secret is stored: no passwords, tokens or request bodies, only the fields below.
 */
const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId },
  actorEmail: { type: String },
  action: { type: String, enum: AUDIT_ACTIONS, required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId },
  targetEmail: { type: String },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  ip: { type: String },
  userAgent: { type: String },
  detail: { type: String, maxlength: 240 },
  count: { type: Number, default: 1 },
  coalesceKey: { type: String },
  lastAt: { type: Date },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ createdAt: -1, _id: -1 });
schema.index({ action: 1, createdAt: -1, _id: -1 });
schema.index({ coalesceKey: 1 }, { unique: true, partialFilterExpression: { coalesceKey: { $type: 'string' } } });

const refuse = () => { throw new Error('The audit log is append-only'); };
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'replaceOne', 'deleteOne', 'deleteMany']) {
  schema.pre(op, refuse);
}
schema.pre('save', function appendOnly() { if (!this.isNew) refuse(); });
schema.pre('deleteOne', { document: true, query: false }, refuse);

export default mongoose.model('AuditLog', schema);
