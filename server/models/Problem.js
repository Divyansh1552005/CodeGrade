import mongoose from 'mongoose';

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, default: '' },
    expectedOutput: { type: String, default: '' },
  },
  { _id: false }
);

// A problem is language-AGNOSTIC: its test cases are just stdin/stdout pairs.
// starterCode is optional boilerplate per language; any/all keys may be empty.
const starterCodeSchema = new mongoose.Schema(
  {
    javascript: { type: String, default: '' },
    python: { type: String, default: '' },
    java: { type: String, default: '' },
    cpp: { type: String, default: '' },
  },
  { _id: false }
);

const problemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    starterCode: { type: starterCodeSchema, default: () => ({}) },
    testCases: { type: [testCaseSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Soft-delete marker: set true instead of removing when Submissions still
    // reference the problem, so submission history stays intact.
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Problem', problemSchema);
