import mongoose from 'mongoose';

const testResultSchema = new mongoose.Schema(
  {
    input: String,
    expectedOutput: String,
    actualOutput: String,
    passed: Boolean,
  },
  { _id: false }
);

const aiFeedbackSchema = new mongoose.Schema(
  {
    summary: String,
    strengths: [String],
    improvements: [String],
    complexityNote: String,
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: true,
    },
    code: { type: String, required: true },
    language: { type: String, enum: ['javascript', 'python', 'java', 'cpp'], required: true },
    testResults: { type: [testResultSchema], default: [] },
    passCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    aiFeedback: { type: aiFeedbackSchema, default: undefined },
    status: {
      type: String,
      enum: ['queued', 'running', 'graded', 'error'],
      default: 'queued',
    },
    error: { type: String },
    testCasesSnapshot: { type: [new mongoose.Schema({ input: String, expectedOutput: String }, { _id: false })], default: undefined, select: false },
    feedbackStatus: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'completed' },
    feedbackError: String,
    rewardDifficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    rewardTopics: { type: [String], default: undefined },
    gamificationRecordedAt: Date,
    gradedAt: Date,
    completionRecordedAt: Date,
  },
  { timestamps: true }
);

// Speeds up "this student's submissions for this problem" lookups (solved
// badges, submission history) — the dominant query shape on this collection.
submissionSchema.index({ studentId: 1, problemId: 1 });
submissionSchema.index({ status: 1, completionRecordedAt: 1 });

export default mongoose.model('Submission', submissionSchema);
