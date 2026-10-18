// Everything the email features read from the environment, with its default, in one place.
// Read lazily (server.js loads .env after its static imports, and tests flip values per test).
import { features } from './features.js';

function num(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function mailConfig(env = process.env) {
  return {
    apiKey: env.RESEND_API_KEY || '',
    from: env.MAIL_FROM || '',
    baseUrl: String(env.APP_BASE_URL || '').replace(/\/+$/, ''),
    tokenSecret: env.EMAIL_TOKEN_SECRET || '',
    verifyTtlMs: num(env, 'EMAIL_VERIFY_TTL_HOURS', 24) * 3600 * 1000,
    resetTtlMs: num(env, 'PASSWORD_RESET_TTL_MINUTES', 30) * 60 * 1000,
    resendCooldownMs: num(env, 'EMAIL_RESEND_COOLDOWN_SECONDS', 60) * 1000,
    resendHourlyCap: num(env, 'EMAIL_RESEND_HOURLY_CAP', 5),
    unverifiedTtlMs: num(env, 'UNVERIFIED_TTL_DAYS', 7) * 86400 * 1000,
    responseFloorMs: num(env, 'AUTH_RESPONSE_FLOOR_MS', 300),
    sendTimeoutMs: num(env, 'EMAIL_SEND_TIMEOUT_MS', 10000),
  };
}

/** No API key outside production: emails are written to the worker log instead of being sent. */
export function devLogOnly(env = process.env) {
  return !env.RESEND_API_KEY && env.NODE_ENV !== 'production';
}

export const emailFeaturesOn = () => features.emailVerification() || features.passwordReset();

/**
 * Called at startup by the API and the worker. Does nothing while both email flags are off;
 * otherwise throws one error that lists everything that is wrong.
 */
export function validateMailConfig(env = process.env) {
  if (!features.emailVerification() && !features.passwordReset()) return;
  const config = mailConfig(env);
  const production = env.NODE_ENV === 'production';
  const problems = [];
  if (config.tokenSecret.length < 32) problems.push('EMAIL_TOKEN_SECRET must be at least 32 characters (and identical for the API and the worker)');
  if (!config.baseUrl) problems.push('APP_BASE_URL is required (the frontend origin used in email links)');
  else {
    let url;
    try { url = new URL(config.baseUrl); } catch { problems.push('APP_BASE_URL is not a valid URL'); }
    if (url && !['http:', 'https:'].includes(url.protocol)) problems.push('APP_BASE_URL must start with http:// or https://');
    else if (url && production && url.protocol !== 'https:') problems.push('APP_BASE_URL must use https in production');
  }
  if (production && !config.apiKey) problems.push('RESEND_API_KEY is required in production');
  if ((production || config.apiKey) && !config.from) problems.push('MAIL_FROM is required, for example "CodeGrade <no-reply@your-domain>"');
  if (problems.length) throw new Error(`Email configuration is invalid:\n - ${problems.join('\n - ')}`);
}
