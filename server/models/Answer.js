import mongoose from 'mongoose';

/**
 * Allowed state transitions for an Answer.
 *
 *   draft   → pending                 (system, automatic after AI generation)
 *   pending → approved                (teacher only)
 *   pending → rejected                (teacher only)
 *   approved / rejected → (terminal, no further transitions)
 *
 * Enforced in a pre-save hook so that even a buggy route or a malicious direct
 * API call cannot bypass it — the model layer is the last line of defense.
 */
const ALLOWED_TRANSITIONS = {
  draft: ['pending'],
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export class InvalidStateTransitionError extends Error {
  constructor(from, to) {
    super(`Invalid answer state transition: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
    this.from = from;
    this.to = to;
  }
}

const answerSchema = new mongoose.Schema(
  {
    doubtId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doubt',
      required: true,
    },
    content: { type: String, required: true },
    source: {
      type: String,
      enum: ['ai', 'teacher'],
      required: true,
    },
    state: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected'],
      default: 'draft',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNotes: { type: String },
    generationKey: String,
    notificationRecordedAt: Date,
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

/**
 * Guard every state change at the model layer. We compare the incoming `state`
 * against the value currently persisted in the DB (`$__.originalValue` via
 * `isModified` + a fetched original) rather than trusting whatever the caller
 * set in memory.
 */
answerSchema.pre('save', async function enforceStateMachine(next) {
  // On creation, only 'draft' or 'pending' are valid starting states.
  if (this.isNew) {
    if (!['draft', 'pending'].includes(this.state)) {
      return next(new InvalidStateTransitionError('(new)', this.state));
    }
    return next();
  }

  if (!this.isModified('state')) {
    return next();
  }

  // Fetch the persisted state so we compare against the DB, not in-memory drift.
  const previous = await this.constructor
    .findById(this._id)
    .select('state')
    .lean();

  const from = previous ? previous.state : undefined;
  const to = this.state;

  if (from === to) {
    return next();
  }

  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return next(new InvalidStateTransitionError(from, to));
  }

  return next();
});

answerSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

// Speeds up GET /answers?state=pending (the teacher review queue).
answerSchema.index({ state: 1 });
answerSchema.index({ generationKey: 1 }, { unique: true, partialFilterExpression: { generationKey: { $type: 'string' } } });

const Answer = mongoose.model('Answer', answerSchema);

export { ALLOWED_TRANSITIONS };
export default Answer;
