// Feature flags. Read at call time (not import time) because server.js loads .env
// after its static imports run, and so tests can flip a flag per test.
const TRUTHY = new Set(['1', 'true', 'on', 'yes']);
const enabled = (name) => TRUTHY.has(String(process.env[name] || '').trim().toLowerCase());

export const features = {
  aiTriage: () => enabled('FEATURE_AI_TRIAGE'),
  hintChat: () => enabled('FEATURE_HINT_CHAT'),
  emailVerification: () => enabled('FEATURE_EMAIL_VERIFICATION'),
  passwordReset: () => enabled('FEATURE_PASSWORD_RESET'),
};

export function featureSnapshot() {
  return { aiTriage: features.aiTriage(), hintChat: features.hintChat() };
}

/** The only flags the public, unauthenticated GET /auth/config exposes. */
export function authConfig() {
  return { emailVerification: features.emailVerification(), passwordReset: features.passwordReset() };
}
