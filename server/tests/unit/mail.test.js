import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { classifyProviderError, createResendTransport, MailError, sendEmail, setMailTransport } from '../../services/mail/mailService.js';
import { TEMPLATES } from '../../services/mail/templates/index.js';
import { escapeHtml, formatDuration } from '../../services/mail/templates/layout.js';

const LINK = 'https://app.example.com/verify-email?token=abc123';
const HOUR = 3600 * 1000;
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; setMailTransport(undefined); jest.restoreAllMocks(); });

describe('templates', () => {
  it('escape user input in the html and keep it plain in the text part', () => {
    const mail = TEMPLATES['verify-email']({ name: '<script>alert("x")</script> & Co', link: LINK, expiresInMs: 24 * HOUR });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co');
    expect(mail.text).toContain('<script>alert("x")</script> & Co');
  });
  it('carry the link as a button and as raw text, the expiry, and the ignore line, with a text alternative', () => {
    const mail = TEMPLATES['password-reset']({ name: 'Ada', link: LINK, expiresInMs: 30 * 60000 });
    expect(mail.subject).toBe('Reset your CodeGrade password');
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.html.split(LINK).length - 1).toBeGreaterThanOrEqual(2);
    expect(mail.html).toContain('expires in 30 minutes');
    expect(mail.html).toContain('If you did not request this');
    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain('expires in 30 minutes');
    expect(mail.text).toContain('ignore this email');
    expect(mail.link).toBe(LINK);
  });
  it('escapes a link that tries to break out of the attribute, and refuses non-http links', () => {
    const mail = TEMPLATES['verify-email']({ name: 'A', link: 'https://x.example/?a="><b>', expiresInMs: HOUR });
    expect(mail.html).not.toContain('"><b>');
    expect(() => TEMPLATES['verify-email']({ name: 'A', link: 'javascript:alert(1)', expiresInMs: HOUR })).toThrow();
  });
  it('says that a new signup request replaced the old one when the address was resubmitted', () => {
    const mail = TEMPLATES['verify-email']({ name: 'A', link: LINK, expiresInMs: HOUR, resubmitted: true });
    expect(mail.text).toContain('A new signup request was submitted for this email address');
    expect(mail.text).toContain('If you did not request this, you can ignore this email');
    expect(TEMPLATES['verify-email']({ name: 'A', link: LINK, expiresInMs: HOUR }).text).not.toContain('new signup request');
  });
  it('send the password changed and account exists notices without any link', () => {
    for (const kind of ['password-changed', 'account-exists']) {
      const mail = TEMPLATES[kind]({ name: 'Ada' });
      expect(mail.link).toBeNull();
      expect(mail.html).not.toMatch(/<a /);
      expect(mail.text).not.toMatch(/https?:\/\//);
    }
  });
  it('use the same plain layout everywhere: no images, no emoji, sentence case subject', () => {
    const all = [TEMPLATES['verify-email']({ name: 'A', link: LINK, expiresInMs: HOUR }), TEMPLATES['password-reset']({ name: 'A', link: LINK, expiresInMs: HOUR }), TEMPLATES['password-changed']({ name: 'A' }), TEMPLATES['account-exists']({ name: 'A' })];
    for (const mail of all) {
      expect(mail.html).not.toMatch(/<img|gradient/i);
      expect(`${mail.subject}${mail.html}${mail.text}`).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(mail.subject).toMatch(/^[A-Z][a-z]/);
    }
  });
  it('formats durations', () => {
    expect(formatDuration(24 * HOUR)).toBe('24 hours');
    expect(formatDuration(HOUR)).toBe('1 hour');
    expect(formatDuration(90 * 60000)).toBe('90 minutes');
    expect(escapeHtml(`<'&">`)).toBe('&lt;&#39;&amp;&quot;&gt;');
  });
});

describe('provider errors', () => {
  const cases = [[500, 'internal_server_error', false], [503, undefined, false], [429, 'rate_limit_exceeded', false], [null, undefined, false], [409, 'concurrent_idempotent_requests', false],
    [400, 'validation_error', true], [422, 'invalid_from_address', true], [401, 'invalid_api_key', true], [403, 'restricted_api_key', true], [409, 'invalid_idempotent_request', true]];
  it.each(cases)('status %s %s -> permanent %s', (statusCode, name, permanent) => {
    expect(classifyProviderError({ statusCode, name, message: 'secret detail' }).permanent).toBe(permanent);
  });
  it('keeps the provider message out of the error', () => {
    expect(classifyProviderError({ statusCode: 400, name: 'validation_error', message: 'to: a@b.com is invalid' }).message).not.toContain('a@b.com');
  });
});

describe('Resend transport', () => {
  const message = { from: 'CodeGrade <a@b.com>', to: 'x@y.com', subject: 's', html: '<p>h</p>', text: 't', tags: [{ name: 'type', value: 'verify_email' }], idempotencyKey: 'email-verify-email-1' };
  it('passes the idempotency key as the SDK request option', async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    const result = await createResendTransport({ emails: { send } }, { timeoutMs: 1000 })(message);
    expect(result).toEqual({ id: 'msg_1' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ['x@y.com'], from: message.from, tags: message.tags }), { idempotencyKey: 'email-verify-email-1' });
  });
  it('turns an error response into a MailError with the right retry flag', async () => {
    const down = createResendTransport({ emails: { send: async () => ({ data: null, error: { statusCode: 500, name: 'internal_server_error', message: 'x' } }) } }, { timeoutMs: 1000 });
    await expect(down(message)).rejects.toMatchObject({ name: 'MailError', permanent: false, status: 500 });
    const bad = createResendTransport({ emails: { send: async () => ({ data: null, error: { statusCode: 422, name: 'validation_error', message: 'x' } }) } }, { timeoutMs: 1000 });
    await expect(bad(message)).rejects.toMatchObject({ permanent: true });
  });
  it('treats a thrown error and a timeout as transient', async () => {
    const thrown = createResendTransport({ emails: { send: async () => { throw new Error('ECONNRESET'); } } }, { timeoutMs: 1000 });
    await expect(thrown(message)).rejects.toMatchObject({ permanent: false });
    const slow = createResendTransport({ emails: { send: () => new Promise(() => {}) } }, { timeoutMs: 20 });
    await expect(slow(message)).rejects.toMatchObject({ permanent: false, message: expect.stringMatching(/timed out/) });
  });
});

describe('sendEmail', () => {
  it('logs only the masked recipient, subject and link, and sends nothing, without a key outside production', async () => {
    delete process.env.RESEND_API_KEY; process.env.NODE_ENV = 'development';
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await sendEmail({ to: 'ada@example.com', subject: 'Verify', html: 'h', text: 't', devLink: LINK });
    expect(result.devLogged).toBe(true);
    const out = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toContain('a***@e***.com');
    expect(out).toContain(LINK);
    expect(out).not.toContain('ada@example.com');
  });
  it('hands the message to the transport with the configured sender', async () => {
    process.env.MAIL_FROM = 'CodeGrade <no-reply@example.com>';
    const transport = jest.fn().mockResolvedValue({ id: 'm1' });
    setMailTransport(transport);
    await sendEmail({ to: 'a@b.com', subject: 's', html: 'h', text: 't', tags: [{ name: 'type', value: 'x' }], idempotencyKey: 'k', devLink: LINK });
    expect(transport).toHaveBeenCalledWith({ from: 'CodeGrade <no-reply@example.com>', to: 'a@b.com', subject: 's', html: 'h', text: 't', tags: [{ name: 'type', value: 'x' }], idempotencyKey: 'k' });
  });
  it('rethrows provider failures and never logs the link', async () => {
    process.env.MAIL_FROM = 'CodeGrade <no-reply@example.com>';
    setMailTransport(jest.fn().mockRejectedValue(new MailError('down', { permanent: false, status: 503 })));
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.LOG_LEVEL = 'info';
    await expect(sendEmail({ to: 'a@b.com', subject: 's', html: 'h', text: 't', devLink: LINK })).rejects.toMatchObject({ permanent: false });
    const written = [...out.mock.calls, ...log.mock.calls].flat().join('\n');
    expect(written).not.toContain('abc123');
    expect(written).not.toContain('a@b.com');
  });
});
