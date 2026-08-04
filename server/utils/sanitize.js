/**
 * Length caps for untrusted content that reaches the LLM. These mitigate both
 * prompt-injection surface area and cost/DoS.
 */
export const LIMITS = {
  doubtTitle: 200,
  doubtBody: 4000,
  code: 20000,
};

export class ContentTooLongError extends Error {
  constructor(field, limit) {
    super(`${field} exceeds maximum length of ${limit} characters`);
    this.name = 'ContentTooLongError';
    this.status = 400;
  }
}

/**
 * Reject content over the limit. We reject rather than silently truncate so the
 * student gets clear feedback and we never grade/answer a mangled input.
 */
export function assertWithinLimit(field, value, limit) {
  if (typeof value === 'string' && value.length > limit) {
    throw new ContentTooLongError(field, limit);
  }
  return value;
}
