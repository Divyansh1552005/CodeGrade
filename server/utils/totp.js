import crypto from 'node:crypto';

// RFC 6238 time-based one-time passwords, built on node:crypto (HMAC-SHA1, 30 second steps, 6 digits).
// This is the algorithm every authenticator app implements, so no library is needed.
export const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Returns a Buffer, or null when the text is not valid base32. */
export function base32Decode(text) {
  const clean = String(text).replace(/[\s=-]/g, '').toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export const generateSecret = () => base32Encode(crypto.randomBytes(20)); // 160 bits, as RFC 4226 recommends

export const stepAt = (timeMs) => Math.floor(timeMs / 1000 / STEP_SECONDS);

/** The code for one step. */
export function codeFor(secretBase32, step) {
  const key = base32Decode(secretBase32);
  if (!key) throw new Error('Invalid TOTP secret');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * The step the code belongs to if it is the code for the previous, current or next step, otherwise null.
 * All three are always compared, each in constant time, so the answer does not depend on which one matched.
 */
export function verifyCode(secretBase32, code, now = Date.now()) {
  const given = Buffer.from(String(code ?? '').padEnd(DIGITS, ' ').slice(0, DIGITS));
  const current = stepAt(now);
  let matched = null;
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(codeFor(secretBase32, step));
    if (crypto.timingSafeEqual(given, expected) && /^\d{6}$/.test(String(code))) matched = step;
  }
  return matched;
}

export function otpauthUri({ secret, account, issuer = 'CodeGrade' }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
