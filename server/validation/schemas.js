import { z } from 'zod';
import { TOPICS } from '../constants/topics.js';
import { SUPPORTED_LANGUAGES } from '../services/languageMap.js';
import { LIMITS } from '../utils/sanitize.js';

// Shape-level validation only — domain rules that need DB state (ownership,
// state-machine transitions, "does this problem exist") stay in the routes.

export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

const nonEmpty = (label) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`);

const starterCodeSchema = z
  .record(z.string(), z.string())
  .transform((obj) => {
    // Keep only known-language keys — mirrors the old sanitizeStarterCode().
    const out = {};
    for (const lang of SUPPORTED_LANGUAGES) {
      if (typeof obj[lang] === 'string') out[lang] = obj[lang];
    }
    return out;
  })
  .optional();

const testCaseSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
});

const sampleCaseSchema = z.object({
  input: nonEmpty('input'),
  output: nonEmpty('output'),
  explanation: z.string().optional().default(''),
});

const topicsSchema = z
  .array(z.enum(TOPICS), { required_error: 'topics is required' })
  .min(1, 'at least one topic is required');

export const createProblemSchema = z.object({
  title: nonEmpty('title'),
  description: nonEmpty('description'),
  inputFormat: nonEmpty('inputFormat'),
  outputFormat: nonEmpty('outputFormat'),
  constraints: nonEmpty('constraints'),
  topics: topicsSchema,
  sampleCases: z
    .array(sampleCaseSchema, { required_error: 'sampleCases must be a non-empty array' })
    .min(1, 'sampleCases must be a non-empty array'),
  testCases: z
    .array(testCaseSchema, { required_error: 'testCases must be a non-empty array' })
    .min(1, 'testCases must be a non-empty array'),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  starterCode: starterCodeSchema,
});

// Same fields, all optional — PATCH is a partial update. `min(1)`/nonEmpty
// checks still apply to whichever fields ARE sent, so a field can never be
// blanked out via PATCH.
export const patchProblemSchema = createProblemSchema.partial();

export const createSubmissionSchema = z.object({
  problemId: objectId,
  code: z.string().min(1, 'code is required').max(LIMITS.code),
  language: z.enum(SUPPORTED_LANGUAGES, {
    errorMap: () => ({ message: `Unsupported language: must be one of ${SUPPORTED_LANGUAGES.join(', ')}` }),
  }),
});

export const createDoubtSchema = z.object({
  title: nonEmpty('title').max(LIMITS.doubtTitle),
  body: nonEmpty('body').max(LIMITS.doubtBody),
});

export const createAnswerSchema = z.object({
  doubtId: objectId,
  content: nonEmpty('content'),
});

export const reviewAnswerSchema = z.object({
  content: z.string().optional(),
  reviewNotes: z.string().optional(),
});

export const registerSchema = z.object({
  name: nonEmpty('name'),
  email: z.string().trim().email('must be a valid email'),
  password: z.string().min(6, 'password must be at least 6 characters'),
  role: z.enum(['student', 'teacher']),
});

export const loginSchema = z.object({
  email: z.string().trim().email('must be a valid email'),
  password: nonEmpty('password'),
});
