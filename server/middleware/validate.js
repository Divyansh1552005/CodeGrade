import { httpError } from './errorHandler.js';

// 'sampleCases', 0, 'output' -> 'sampleCases[0].output' (JS-property-access
// style reads better in an error message than the default dotted zod path).
function formatPath(path) {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${seg}` : String(seg);
  }
  return out;
}

/**
 * Validate & coerce `req[part]` against a zod schema, replacing it with the
 * parsed (and thus type-narrowed/defaulted) value. On failure, throws a 400
 * with the first issue's message so callers get one clear reason, not a
 * Zod error dump.
 */
export function validate(schema, part = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = formatPath(issue.path);
      throw httpError(400, path ? `${path}: ${issue.message}` : issue.message);
    }
    req[part] = result.data;
    next();
  };
}
