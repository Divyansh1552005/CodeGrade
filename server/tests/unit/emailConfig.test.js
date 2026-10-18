import { afterEach, describe, expect, it } from '@jest/globals';
import { maskEmail } from '../../utils/maskEmail.js';
import { redact } from '../../utils/logger.js';
import { devLogOnly, mailConfig, validateMailConfig } from '../../config/mail.js';
import { registerSchema, passwordSchema } from '../../validation/schemas.js';

const SECRET = 'x'.repeat(32);
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });
const withEnv = (extra) => { process.env = { ...saved, ...extra }; };

describe('maskEmail', () => {
  it('keeps the first letters and the top-level domain only', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@e***.com');
    expect(maskEmail('a@b.co')).toBe('a***@b***.co');
    expect(maskEmail('nobody')).toBe('***');
    expect(maskEmail(undefined)).toBe('***');
  });
  it('is applied to email keys by the logger and links and html never reach it', () => {
    expect(redact({ email: 'alice@example.com', to: 'bob@site.org', link: 'https://x/verify?token=abc', html: '<p>x</p>' }))
      .toEqual({ email: 'a***@e***.com', to: 'b***@s***.org', link: '[redacted length=26]', html: '[redacted length=8]' });
  });
});

describe('validateMailConfig', () => {
  it('lists every problem at once', () => {
    withEnv({ EMAIL_TOKEN_SECRET: 'short', APP_BASE_URL: '', NODE_ENV: 'production', BREVO_API_KEY: '', MAIL_FROM: '' });
    expect(() => validateMailConfig()).toThrow(/EMAIL_TOKEN_SECRET[\s\S]*APP_BASE_URL[\s\S]*BREVO_API_KEY[\s\S]*MAIL_FROM/);
  });
  it('accepts dev log-only mode without a key or sender', () => {
    withEnv({ EMAIL_TOKEN_SECRET: SECRET, APP_BASE_URL: 'http://localhost:5173', NODE_ENV: 'development', BREVO_API_KEY: '', MAIL_FROM: '' });
    expect(() => validateMailConfig()).not.toThrow();
    expect(devLogOnly()).toBe(true);
  });
  it('requires https in production and the sender once a key is set', () => {
    withEnv({ EMAIL_TOKEN_SECRET: SECRET, APP_BASE_URL: 'http://app.example.com', NODE_ENV: 'production', BREVO_API_KEY: 're_x', MAIL_FROM: 'CodeGrade <a@b.com>' });
    expect(() => validateMailConfig()).toThrow(/https/);
    withEnv({ EMAIL_TOKEN_SECRET: SECRET, APP_BASE_URL: 'http://localhost:5173', NODE_ENV: 'development', BREVO_API_KEY: 're_x', MAIL_FROM: '' });
    expect(() => validateMailConfig()).toThrow(/MAIL_FROM/);
  });
  it('reads token lifetimes from the environment with the agreed defaults', () => {
    expect(mailConfig({}).verifyTtlMs).toBe(24 * 3600 * 1000);
    expect(mailConfig({}).resetTtlMs).toBe(30 * 60 * 1000);
    expect(mailConfig({ EMAIL_VERIFY_TTL_HOURS: '2', PASSWORD_RESET_TTL_MINUTES: '5' })).toMatchObject({ verifyTtlMs: 7200000, resetTtlMs: 300000 });
  });
});

describe('password length', () => {
  const base = { name: 'A', email: 'a@b.co', accountType: 'student' };
  it('counts bytes, not characters, against the 72 byte maximum', () => {
    expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
    expect(passwordSchema.safeParse('é'.repeat(36)).success).toBe(true); // 72 bytes
    const tooLong = passwordSchema.safeParse('é'.repeat(37)); // 37 characters, 74 bytes
    expect(tooLong.success).toBe(false);
    expect(tooLong.error.issues[0].message).toMatch(/at most 72 bytes/);
  });
  it('keeps the minimum of 6 and applies to signup', () => {
    expect(registerSchema.safeParse({ ...base, password: '12345' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: '123456' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, password: 'a'.repeat(73) }).success).toBe(false);
  });
});
