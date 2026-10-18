import crypto from 'node:crypto';
import User, { isVerified } from '../models/User.js';
import TeacherApplication from '../models/TeacherApplication.js';
import { mailConfig } from '../config/mail.js';
import { isReservedEmail } from './adminConfig.js';
import { logger } from '../utils/logger.js';
import { ensureWork } from './workService.js';
import { isTokenActive, tokenLink, ttlFor } from './emailTokens.js';
import { sendEmail } from './mail/mailService.js';
import { TEMPLATES } from './mail/templates/index.js';

// kind -> the token type it carries (none for the notices) and the provider tag value.
const KINDS = {
  'verify-email': { token: 'verify', tag: 'verify_email' },
  'password-reset': { token: 'reset', tag: 'password_reset' },
  'password-changed': { token: null, tag: 'password_changed' },
  'account-exists': { token: null, tag: 'account_exists' },
  'teacher-approved': { token: null, tag: 'teacher_approved' },
  'teacher-rejected': { token: null, tag: 'teacher_rejected' },
};
export const EMAIL_KINDS = Object.keys(KINDS);

/**
 * Put an email in the outbox. The payload holds ids only: no address and no token (the worker looks the
 * user up and recomputes the link). The work key doubles as the provider idempotency key, so a retried or
 * replayed job cannot send the same email twice. `tokenId` is the token's id for link emails, and a fresh
 * random event id for the notices unless `ref` names the event (an application, a decision), which makes
 * the email once per event. `resubmitted` is for a verification that replaces an earlier signup; `extra`
 * carries ids such as the application id.
 */
export function queueEmail({ kind, userId, tokenId, ref, resubmitted = false, extra = {} }) {
  if (!KINDS[kind]) throw new Error(`Unknown email kind ${kind}`);
  const key = tokenId || ref || crypto.randomBytes(16).toString('hex');
  return ensureWork({
    key: `email-${kind}-${key}`, type: 'send-email', ownerId: userId,
    payload: { kind, userId: String(userId), ref: key, ...(resubmitted ? { resubmitted: true } : {}), ...extra },
  });
}

/** True when the email no longer needs to be sent: the account is gone, already verified, or the link is dead. */
async function staleReason(kind, user, tokenType, ref) {
  if (!user) return 'user_missing';
  if (kind === 'verify-email' && isVerified(user)) return 'already_verified';
  if (tokenType && !(await isTokenActive(user._id, tokenType, ref))) return 'token_inactive';
  return null;
}

// The two teacher emails (approved, rejected) depend on an application. Each is skipped if the application has moved on since
// it was queued (a later decision supersedes an earlier one).
async function teacherContext(data, user) {
  const application = await TeacherApplication.findById(data.applicationId);
  if (!application) return { stale: 'application_missing' };
  const base = mailConfig().baseUrl;
  const wanted = data.kind === 'teacher-approved' ? 'approved' : 'rejected';
  if (application.status !== wanted || application.decisionSeq !== data.decisionSeq) return { stale: 'decision_superseded' };
  return data.kind === 'teacher-approved'
    ? { args: {}, link: `${base}/login` }
    : { args: { reason: application.decisionReason || '' }, link: null };
}

/** Worker handler for 'send-email'. A skipped email completes the job: there is nothing to retry. */
export async function processEmail({ data }) {
  const spec = KINDS[data.kind];
  if (!spec) return { skipped: 'unknown_kind' };
  const user = await User.findById(data.userId);
  // The admin account never receives mail from the app: ADMIN_EMAIL is only a login name.
  if (user && (user.role === 'admin' || isReservedEmail(user.email))) {
    logger.info('email.skipped', { kind: data.kind, reason: 'admin_is_never_mailed' });
    return { skipped: 'admin_is_never_mailed' };
  }
  let reason = await staleReason(data.kind, user, spec.token, data.ref);
  let extra = { args: {}, link: spec.token ? tokenLink(spec.token, data.ref) : null };
  if (!reason && data.applicationId) {
    const context = await teacherContext(data, user);
    if (context.stale) reason = context.stale;
    else extra = context;
  }
  if (reason) {
    logger.info('email.skipped', { kind: data.kind, reason });
    return { skipped: reason };
  }
  const mail = TEMPLATES[data.kind]({
    name: user.name, link: extra.link, expiresInMs: spec.token ? ttlFor(spec.token) : undefined, resubmitted: data.resubmitted, ...extra.args,
  });
  await sendEmail({
    to: user.email, subject: mail.subject, html: mail.html, text: mail.text,
    tags: [{ name: 'type', value: spec.tag }], idempotencyKey: `email-${data.kind}-${data.ref}`, devLink: extra.link || undefined,
  });
  return { sent: true };
}
