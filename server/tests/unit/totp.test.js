import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { base32Decode, base32Encode, codeFor, generateSecret, otpauthUri, stepAt, verifyCode } from '../../utils/totp.js';

// RFC 6238 appendix B: the SHA-1 secret is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors (last six digits)', () => {
    const vectors = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']];
    for (const [seconds, code] of vectors) expect(codeFor(RFC_SECRET, stepAt(seconds * 1000))).toBe(code);
  });
  it('round-trips base32 and rejects text that is not base32', () => {
    const bytes = Buffer.from('hello world, this is a secret');
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    expect(base32Decode('not base32!')).toBeNull();
    expect(base32Decode('')).toBeNull();
    expect(generateSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });
  it('accepts the previous, current and next step and nothing else', () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    expect(verifyCode(RFC_SECRET, codeFor(RFC_SECRET, step), now)).toBe(step);
    expect(verifyCode(RFC_SECRET, codeFor(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyCode(RFC_SECRET, codeFor(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyCode(RFC_SECRET, codeFor(RFC_SECRET, step - 2), now)).toBeNull();
    expect(verifyCode(RFC_SECRET, codeFor(RFC_SECRET, step + 2), now)).toBeNull();
  });
  it('rejects missing, short, long and non-numeric codes', () => {
    const now = 1_700_000_000_000;
    const good = codeFor(RFC_SECRET, stepAt(now));
    for (const bad of [undefined, null, '', '12345', `${good}0`, 'abcdef', ` ${good}`, `${good} `]) expect(verifyCode(RFC_SECRET, bad, now)).toBeNull();
  });
  it('compares in constant time and always checks all three steps', () => {
    const source = fs.readFileSync(new URL('../../utils/totp.js', import.meta.url), 'utf8');
    expect(source).toMatch(/timingSafeEqual/);
    expect(source).not.toMatch(/break;|return step/); // no early exit on a match
  });
  it('builds an otpauth URI an authenticator app understands', () => {
    const uri = otpauthUri({ secret: 'ABC234', account: 'a@b.co' });
    expect(uri).toBe('otpauth://totp/CodeGrade:a%40b.co?secret=ABC234&issuer=CodeGrade&algorithm=SHA1&digits=6&period=30');
  });
  it('lets the secret script print to a terminal only', () => {
    let failure;
    try { execFileSync(process.execPath, ['scripts/adminTotp.js'], { encoding: 'utf8', stdio: 'pipe' }); } catch (err) { failure = err; }
    expect(failure.stderr).toMatch(/Refusing to print a secret to a pipe/);
    expect(failure.stdout).toBe('');
    const piped = execFileSync(process.execPath, ['scripts/adminTotp.js', '--allow-pipe'], { encoding: 'utf8', stdio: 'pipe' });
    expect(piped).toMatch(/ADMIN_TOTP_SECRET=[A-Z2-7]{32}/);
    expect(piped).toMatch(/otpauth:\/\/totp\//);
  });
});
