import axios from 'axios';
import { devLogOnly, mailConfig } from '../../config/mail.js';
import { logger } from '../../utils/logger.js';
import { maskEmail } from '../../utils/maskEmail.js';

/**
 * The one place that talks to the email provider (Brevo). A failure carries `permanent`: true when retrying
 * cannot help (the provider rejected the request), false when it might (network, timeout, 429, 5xx).
 */
export class MailError extends Error {
  constructor(message, { permanent, status = null, code = '' }) {
    super(message);
    this.name = 'MailError';
    this.permanent = permanent;
    this.status = status;
    this.code = code;
  }
}

/** `status` is the HTTP status, or null when there was no response at all (network failure, timeout). */
export function classifyProviderError({ status = null, code = '' } = {}) {
  const transient = status === null || status === 408 || status === 429 || status >= 500;
  // Only the provider's status and code are kept: its message can echo the request, including the recipient.
  return new MailError(`Email provider error${status ? ` ${status}` : ''}${code ? ` ${code}` : ''}`, { permanent: !transient, status, code });
}

/** "CodeGrade <no-reply@example.com>" -> { name, email }. A bare address has no name. */
export function parseSender(from) {
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(from);
  if (!match) return { email: from.trim() };
  return match[1] ? { name: match[1].replace(/^"|"$/g, ''), email: match[2].trim() } : { email: match[2].trim() };
}

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Sends through Brevo's transactional API (POST /v3/smtp/email, `api-key` header). It uses axios, which the
 * project already depends on, so no extra package is needed. Brevo has no idempotency-key header: a retried
 * job cannot double-send once it has completed (the outbox marks it done), but a request that Brevo accepted
 * and whose response was lost would be sent again on the retry.
 */
export function createBrevoTransport({ apiKey, timeoutMs, http = axios }) {
  return async function send(message) {
    try {
      const { data } = await http.post(BREVO_URL, {
        sender: parseSender(message.from),
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.tags?.length ? { tags: message.tags.map((tag) => tag.value) } : {}),
      }, { headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' }, timeout: timeoutMs });
      return { id: data?.messageId ?? null };
    } catch (err) {
      throw classifyProviderError({ status: err.response?.status ?? null, code: typeof err.response?.data?.code === 'string' ? err.response.data.code : '' });
    }
  };
}

let transport; // tests replace it with setMailTransport
let brevoTransport;
export function setMailTransport(fn) { transport = fn; }

function activeTransport(config) {
  if (transport) return transport;
  brevoTransport ??= createBrevoTransport({ apiKey: config.apiKey, timeoutMs: config.sendTimeoutMs });
  return brevoTransport;
}

/**
 * sendEmail({ to, subject, html, text, tags, idempotencyKey, devLink })
 * Without BREVO_API_KEY outside production nothing is sent: the recipient (masked), subject and `devLink`
 * go to the console. That is the only place a link is ever written to a log.
 */
export async function sendEmail({ to, subject, html, text, tags = [], idempotencyKey, devLink }) {
  const config = mailConfig();
  if (!transport && devLogOnly()) {
    console.log(`[mail:dev] to=${maskEmail(to)} subject="${subject}"${devLink ? `\n[mail:dev] link: ${devLink}` : ''}`);
    return { id: null, devLogged: true };
  }
  const started = Date.now();
  try {
    const result = await activeTransport(config)({ from: config.from, to, subject, html, text, tags, idempotencyKey });
    logger.info('email.sent', { to, tags: tags.map((t) => t.value), providerId: result.id, ms: Date.now() - started });
    return result;
  } catch (err) {
    logger.warn('email.failed', { to, tags: tags.map((t) => t.value), permanent: Boolean(err.permanent), status: err.status ?? null, errorCode: err.code || '', ms: Date.now() - started });
    throw err;
  }
}
