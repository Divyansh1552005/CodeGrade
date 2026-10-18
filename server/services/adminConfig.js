import { PASSWORD_MAX_BYTES } from '../validation/schemas.js';

// Everything the env-managed admin account reads from the environment. Read lazily, like the other config.
const TRIVIAL = ['password', 'passw0rd', 'admin', 'administrator', 'changeme', 'letmein', 'welcome', 'qwerty', 'iloveyou', 'secret', 'default', 'codegrade', 'test'];
const MIN_PRODUCTION_LENGTH = 12;

export function adminConfig(env = process.env) {
  const hours = Number(env.ADMIN_SESSION_HOURS);
  return {
    email: String(env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: env.ADMIN_PASSWORD || '',
    sessionHours: Number.isFinite(hours) && hours > 0 ? hours : 8,
    production: env.NODE_ENV === 'production',
  };
}

/** The address reserved for the admin, or '' when no admin is configured. */
export const reservedEmail = (env = process.env) => adminConfig(env).email;
export const isReservedEmail = (email, env = process.env) => {
  const reserved = reservedEmail(env);
  return Boolean(reserved) && String(email ?? '').trim().toLowerCase() === reserved;
};

function weakness(password, email) {
  const lower = password.toLowerCase();
  const local = email.split('@')[0];
  const alnum = lower.replace(/[^a-z0-9]/g, '');
  if (new Set(password).size < 5) return 'it repeats too few different characters';
  if (TRIVIAL.some((word) => alnum.includes(word))) return 'it contains a common word';
  if (local.length >= 4 && lower.includes(local)) return 'it contains the admin email name';
  if (/^(0123456789|1234567890|abcdefghij|qwertyuiop)/.test(alnum) || /(0123456789|1234567890|abcdefghij|qwertyuiop)/.test(alnum)) return 'it is a keyboard or number sequence';
  return null;
}

/**
 * Throws, before the server connects to anything, when the admin settings are unusable. Nothing in a
 * message here ever contains the password. Returns warnings for things that are allowed but worth saying.
 */
export function validateAdminConfig(env = process.env) {
  const config = adminConfig(env);
  const warnings = [];
  if (!config.email) {
    warnings.push('ADMIN_EMAIL is not set: no admin account is managed from the environment.');
    return { config, warnings };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) throw new Error('ADMIN_EMAIL is not a valid email address.');
  if (!config.password) throw new Error('ADMIN_PASSWORD is required when ADMIN_EMAIL is set.');
  if (config.password.length < 6) throw new Error('ADMIN_PASSWORD must be at least 6 characters.');
  if (Buffer.byteLength(config.password, 'utf8') > PASSWORD_MAX_BYTES) throw new Error(`ADMIN_PASSWORD must be at most ${PASSWORD_MAX_BYTES} bytes.`);
  if (config.production) {
    if (config.password.length < MIN_PRODUCTION_LENGTH) throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PRODUCTION_LENGTH} characters in production.`);
    const reason = weakness(config.password, config.email);
    if (reason) throw new Error(`ADMIN_PASSWORD is too easy to guess in production: ${reason}. Choose a long random password.`);
  }
  return { config, warnings };
}
