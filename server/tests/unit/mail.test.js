import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { classifyProviderError, createBrevoTransport, MailError, parseSender, sendEmail, setMailTransport } from '../../services/mail/mailService.js';
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
  const cases = [[500, false], [502, false], [503, false], [429, false], [408, false], [null, false],
    [400, true], [401, true], [402, true], [403, true], [404, true], [422, true]];
  it.each(cases)('status %s -> permanent %s', (status, permanent) => {
    expect(classifyProviderError({ status, code: 'x' }).permanent).toBe(permanent);
  });
  it('keeps only the status and code in the error', () => {
    const err = classifyProviderError({ status: 400, code: 'invalid_parameter' });
    expect(err.message).toBe('Email provider error 400 invalid_parameter');
    expect(err.message).not.toContain('@');
  });
});

describe('sender', () => {
  it('splits a display name from the address', () => {
    expect(parseSender('CodeGrade <no-reply@example.com>')).toEqual({ name: 'CodeGrade', email: 'no-reply@example.com' });
    expect(parseSender('"Code Grade" <a@b.co>')).toEqual({ name: 'Code Grade', email: 'a@b.co' });
    expect(parseSender('<a@b.co>')).toEqual({ email: 'a@b.co' });
    expect(parseSender('a@b.co')).toEqual({ email: 'a@b.co' });
  });
});

describe('Brevo transport', () => {
  const message = { from: 'CodeGrade <no-reply@example.com>', to: 'x@y.com', subject: 's', html: '<p>h</p>', text: 't', tags: [{ name: 'type', value: 'verify_email' }], idempotencyKey: 'k' };
  const httpError = (status, data) => Object.assign(new Error('http'), { response: status ? { status, data } : undefined });
  it('posts the transactional email with the api-key header and a timeout', async () => {
    const post = jest.fn().mockResolvedValue({ data: { messageId: '<abc@smtp-relay.mailin.fr>' } });
    const result = await createBrevoTransport({ apiKey: 'xkeysib-secret', timeoutMs: 1234, http: { post } })(message);
    expect(result).toEqual({ id: '<abc@smtp-relay.mailin.fr>' });
    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(body).toEqual({ sender: { name: 'CodeGrade', email: 'no-reply@example.com' }, to: [{ email: 'x@y.com' }], subject: 's', htmlContent: '<p>h</p>', textContent: 't', tags: ['verify_email'] });
    expect(options.headers['api-key']).toBe('xkeysib-secret');
    expect(options.timeout).toBe(1234);
  });
  it('turns an error response into a MailError with the right retry flag', async () => {
    const transport = (error) => createBrevoTransport({ apiKey: 'k', timeoutMs: 1000, http: { post: async () => { throw error; } } });
    await expect(transport(httpError(503, { code: 'service_unavailable' }))(message)).rejects.toMatchObject({ name: 'MailError', permanent: false, status: 503 });
    await expect(transport(httpError(429, { code: 'too_many_requests' }))(message)).rejects.toMatchObject({ permanent: false });
    await expect(transport(httpError(400, { code: 'invalid_parameter', message: 'x@y.com is bad' }))(message)).rejects.toMatchObject({ permanent: true, status: 400, code: 'invalid_parameter' });
    await expect(transport(httpError(401, { code: 'unauthorized' }))(message)).rejects.toMatchObject({ permanent: true });
  });
  it('treats a network failure or timeout, with no response, as transient', async () => {
    const down = createBrevoTransport({ apiKey: 'k', timeoutMs: 1000, http: { post: async () => { throw Object.assign(new Error('timeout of 1000ms exceeded'), { code: 'ECONNABORTED' }); } } });
    await expect(down(message)).rejects.toMatchObject({ permanent: false, status: null });
  });
  it('never puts the api key or the recipient in an error', async () => {
    const down = createBrevoTransport({ apiKey: 'xkeysib-secret', timeoutMs: 1000, http: { post: async () => { throw httpError(400, { code: 'invalid_parameter', message: 'x@y.com xkeysib-secret' }); } } });
    const err = await down(message).catch((e) => e);
    expect(`${err.message}${err.stack}`).not.toMatch(/xkeysib-secret|x@y\.com/);
  });
});

describe('sendEmail', () => {
  it('logs only the masked recipient, subject and link, and sends nothing, without a key outside production', async () => {
    delete process.env.BREVO_API_KEY; process.env.NODE_ENV = 'development';
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
