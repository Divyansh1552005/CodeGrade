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
  },
  { timestamps: true }
);

export default mongoose.model('Submission', submissionSchema);
