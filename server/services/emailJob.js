import crypto from 'node:crypto';
import User, { isVerified } from '../models/User.js';
import { mailConfig } from '../config/mail.js';
import { logger } from '../utils/logger.js';
import { ensureWork } from './workService.js';
import { isTokenActive, tokenLink, ttlFor } from './emailTokens.js';
import { sendEmail } from './mail/mailService.js';
import { TEMPLATES } from './mail/templates/index.js';

// kind -> the token type it carries (none for the notices) and the Resend tag value.
const KINDS = {
  'verify-email': { token: 'verify', tag: 'verify_email' },
  'password-reset': { token: 'reset', tag: 'password_reset' },
  'password-changed': { token: null, tag: 'password_changed' },
  'account-exists': { token: null, tag: 'account_exists' },
};
export const EMAIL_KINDS = Object.keys(KINDS);

/**
 * Put an email in the outbox. The payload holds ids only: no address and no token (the worker looks the
 * user up and recomputes the link). The work key doubles as the provider idempotency key, so a retried or
 * replayed job cannot send the same email twice. `tokenId` is the token's id for link emails, and a fresh
 * random event id for the notices. `resubmitted` is for a verification that replaces an earlier signup.
 */
export function queueEmail({ kind, userId, tokenId, resubmitted = false }) {
  if (!KINDS[kind]) throw new Error(`Unknown email kind ${kind}`);
  const ref = tokenId || crypto.randomBytes(16).toString('hex');
  return ensureWork({
    key: `email-${kind}-${ref}`, type: 'send-email', ownerId: userId,
    payload: { kind, userId: String(userId), ref, ...(resubmitted ? { resubmitted: true } : {}) },
  });
}

/** True when the email no longer needs to be sent: the account is gone, already verified, or the link is dead. */
async function staleReason(kind, user, tokenType, ref) {
  if (!user) return 'user_missing';
  if (kind === 'verify-email' && isVerified(user)) return 'already_verified';
  if (tokenType && !(await isTokenActive(user._id, tokenType, ref))) return 'token_inactive';
  return null;
}

/** Worker handler for 'send-email'. A skipped email completes the job: there is nothing to retry. */
export async function processEmail({ data }) {
  const spec = KINDS[data.kind];
  if (!spec) return { skipped: 'unknown_kind' };
  const user = await User.findById(data.userId);
  const reason = await staleReason(data.kind, user, spec.token, data.ref);
  if (reason) {
    logger.info('email.skipped', { kind: data.kind, reason });
    return { skipped: reason };
  }
  const link = spec.token ? tokenLink(spec.token, data.ref) : null;
  const mail = TEMPLATES[data.kind]({ name: user.name, link, expiresInMs: spec.token ? ttlFor(spec.token) : undefined, resubmitted: data.resubmitted });
  await sendEmail({
    to: user.email, subject: mail.subject, html: mail.html, text: mail.text,
    tags: [{ name: 'type', value: spec.tag }], idempotencyKey: `email-${data.kind}-${data.ref}`, devLink: link || undefined,
  });
  return { sent: true };
}
