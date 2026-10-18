import { Resend } from 'resend';
import { devLogOnly, mailConfig } from '../../config/mail.js';
import { logger } from '../../utils/logger.js';
import { maskEmail } from '../../utils/maskEmail.js';

/**
 * The one place that talks to Resend. A failure carries `permanent`: true when retrying cannot help
 * (the provider rejected the request), false when it might (network, timeout, 429, 5xx).
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

// 409 concurrent_idempotent_requests means the same key is in flight right now: try again shortly.
const TRANSIENT_CODES = new Set(['concurrent_idempotent_requests', 'rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded', 'internal_server_error', 'application_error']);

export function classifyProviderError(error) {
  const status = error?.statusCode ?? null;
  const code = error?.name || '';
  const transient = status === null || status === 429 || status >= 500 || TRANSIENT_CODES.has(code);
  // Only the provider's code and status are kept: its message can echo the request.
  return new MailError(`Email provider error${status ? ` ${status}` : ''}${code ? ` ${code}` : ''}`, { permanent: !transient, status, code });
}

/**
 * Wraps a Resend client. The idempotency key goes in the SDK's second argument:
 * `resend.emails.send(payload, { idempotencyKey })`, which sends the `Idempotency-Key` header.
 */
export function createResendTransport(client, { timeoutMs }) {
  return async function send(message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new MailError('Email provider timed out', { permanent: false })), timeoutMs); });
    try {
      const response = await Promise.race([
        client.emails.send(
          { from: message.from, to: [message.to], subject: message.subject, html: message.html, text: message.text, tags: message.tags },
          message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined,
        ),
        timeout,
      ]);
      if (response?.error) throw classifyProviderError(response.error);
      return { id: response?.data?.id ?? null };
    } catch (err) {
      if (err instanceof MailError) throw err;
      throw new MailError('Email provider unreachable', { permanent: false }); // a thrown error is a network failure
    } finally {
      clearTimeout(timer);
    }
  };
}

let transport; // tests replace it with setMailTransport
let resendTransport;
export function setMailTransport(fn) { transport = fn; }

function activeTransport(config) {
  if (transport) return transport;
  resendTransport ??= createResendTransport(new Resend(config.apiKey), { timeoutMs: config.sendTimeoutMs });
  return resendTransport;
}

/**
 * sendEmail({ to, subject, html, text, tags, idempotencyKey, devLink })
 * Without RESEND_API_KEY outside production nothing is sent: the recipient (masked), subject and `devLink`
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
