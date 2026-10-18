import { randomUUID } from 'node:crypto';

// Minimal structured logger: one JSON object per line. Free text written by users
// (code, doubts, chat messages, model replies) must never reach the logs, so those
// keys are replaced with their length and any long string is cut down.
const SENSITIVE_KEYS = new Set([
  'code', 'body', 'message', 'content', 'text', 'prompt', 'reply', 'messages', 'history',
  'doubt', 'snippet', 'password', 'token', 'authorization', 'cookie', 'apikey',
]);
const MAX_STRING = 160;
const MAX_DEPTH = 3;

function sizeOf(value) {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  return undefined;
}

export function redact(value, depth = 0, key = '') {
  if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
    const size = sizeOf(value);
    return size === undefined ? '[redacted]' : `[redacted length=${size}]`;
  }
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `[truncated length=${value.length}]` : value;
  }
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth, 'error') };
  if (Array.isArray(value)) {
    return depth >= MAX_DEPTH ? `[array length=${value.length}]` : value.slice(0, 20).map((item) => redact(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    if (typeof value.toHexString === 'function') return String(value);
    if (value instanceof Date) return value.toISOString();
    if (depth >= MAX_DEPTH) return '[object]';
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, depth + 1, k)]));
  }
  return value;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
function threshold() {
  const configured = process.env.LOG_LEVEL;
  if (configured && LEVELS[configured]) return LEVELS[configured];
  return process.env.NODE_ENV === 'test' ? LEVELS.silent : LEVELS.info;
}

function write(level, event, context, fields) {
  if (LEVELS[level] < threshold()) return;
  const line = { time: new Date().toISOString(), level, event, ...redact({ ...context, ...fields }) };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

export function createLogger(context = {}) {
  return {
    debug: (event, fields) => write('debug', event, context, fields),
    info: (event, fields) => write('info', event, context, fields),
    warn: (event, fields) => write('warn', event, context, fields),
    error: (event, fields) => write('error', event, context, fields),
    child: (extra) => createLogger({ ...context, ...extra }),
  };
}

export const logger = createLogger();

export function newRequestId() {
  return randomUUID();
}
