import { z } from 'zod';
import { TOPICS } from '../constants/topics.js';
import { SUPPORTED_LANGUAGES } from '../services/languageMap.js';
import { LIMITS } from '../utils/sanitize.js';
import { cleanText } from '../utils/plainText.js';

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
  problemId: objectId.optional(),
  code: z.string().trim().max(LIMITS.doubtCode).optional(),
});

export const createAnswerSchema = z.object({
  doubtId: objectId,
  content: nonEmpty('content'),
});

export const reviewAnswerSchema = z.object({
  content: z.string().optional(),
  reviewNotes: z.string().optional(),
});

// bcrypt only reads the first 72 bytes, so the limit is in bytes: a multi-byte character counts as several.
export const PASSWORD_MAX_BYTES = 72;
export const passwordSchema = z
  .string({ required_error: 'password is required' })
  .min(6, 'password must be at least 6 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES, `password must be at most ${PASSWORD_MAX_BYTES} bytes (characters such as accents and emoji count as more than one)`);

// Free text from a stranger: cleaned (control and bidi characters removed) and length-limited. Plain text only.
const plain = (label, max, { multiline = false } = {}) => z
  .string({ required_error: `${label} is required` })
  .transform((value) => cleanText(value, { multiline }))
  .refine((value) => value.length <= max, `${label} must be at most ${max} characters`);

// Strict on purpose: an unknown key, above all a `role`, is a 400, never ignored. Public signup chooses
// only `student` or `teacher` (which creates a teacher_applicant that an admin must approve).
export const registerSchema = z.object({
  name: plain('name', 100).refine((v) => v.length >= 1, 'name is required'),
  email: z.string().trim().email('must be a valid email'),
  password: passwordSchema,
  accountType: z.enum(['student', 'teacher'], { errorMap: () => ({ message: 'accountType must be student or teacher' }) }),
  organization: plain('organization', 120).optional(),
  note: plain('note', 500, { multiline: true }).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.accountType === 'teacher') {
    if (!value.organization || value.organization.length < 2) ctx.addIssue({ code: 'custom', path: ['organization'], message: 'organization is required for a teacher account' });
  } else {
    for (const field of ['organization', 'note']) {
      if (value[field] !== undefined) ctx.addIssue({ code: 'custom', path: [field], message: `${field} is only for teacher accounts` });
    }
  }
});

const emailField = z.string().trim().email('must be a valid email');
export const emailOnlySchema = z.object({ email: emailField });
export const tokenSchema = z.object({ token: z.string({ required_error: 'token is required' }).min(1, 'token is required').max(200, 'token is not valid') });
export const resetPasswordSchema = tokenSchema.extend({ password: passwordSchema });

export const loginSchema = z.object({
  email: z.string().trim().email('must be a valid email'),
  password: nonEmpty('password'),
  // "admin" is sent only by the /admin/login page: a non-admin is then refused like a wrong password and
  // gets no session. `totp` is the authenticator code, checked only for the admin account.
  scope: z.literal('admin').optional(),
  totp: z.string().max(12).optional(),
});

// Shared paging query: `limit` defaults to 10 and is clamped to 50 on the server; anything that is
// not a whole number of at least 1 is a 400. `cursor` is opaque and is checked by parseCursor.
export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 50;
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).optional().transform((n) => Math.min(n ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT)),
  cursor: z.string().max(300).optional(),
});
