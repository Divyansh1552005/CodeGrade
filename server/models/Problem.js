import mongoose from 'mongoose';
import { TOPICS } from '../constants/topics.js';

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, default: '' },
    expectedOutput: { type: String, default: '' },
  },
  { _id: false }
);

// A worked example shown to students: what goes in, what must come out, and
// (optionally) why. Unlike testCases these are always public.
const sampleCaseSchema = new mongoose.Schema(
  {
    input: { type: String, default: '' },
    output: { type: String, default: '' },
    explanation: { type: String, default: '' },
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
    // Statement sections. Mandatory for teacher-authored problems — enforced in
    // routes/problems.js so existing/fixture docs can still be saved directly.
    inputFormat: { type: String, default: '' },
    outputFormat: { type: String, default: '' },
    constraints: { type: String, default: '' },
    sampleCases: { type: [sampleCaseSchema], default: [] },
    // Fixed, LeetCode-style categorization — a problem can carry several.
    // Mandatory for teacher-authored problems (enforced in routes/problems.js).
    topics: { type: [{ type: String, enum: TOPICS }], default: [] },
    starterCode: { type: starterCodeSchema, default: () => ({}) },
    testCases: { type: [testCaseSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Soft-delete marker: set true instead of removing when Submissions still
    // reference the problem, so submission history stays intact.
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Speeds up the topics=a,b filter on GET /problems.
problemSchema.index({ topics: 1 });

export default mongoose.model('Problem', problemSchema);
