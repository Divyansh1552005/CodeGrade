/**
 * httpOnly cookie for the refresh token.
 *
 * The refresh token is the long-lived secret, so it lives in an httpOnly cookie
 * (never readable by JS) instead of localStorage — an XSS bug can't exfiltrate
 * it. The short-lived access token is NOT stored here; it is returned in the
 * response body and held in client memory, then sent as a Bearer header.
 *
 * `sameSite: 'lax'` + `secure` in production guard against CSRF/leakage. Path is
 * '/' so the cookie is sent regardless of the dev proxy's `/api` prefix.
 */
import jwt from 'jsonwebtoken';

export const REFRESH_COOKIE = 'refreshToken';

const isProd = process.env.NODE_ENV === 'production';

// Match the cookie lifetime to the refresh JWT's own expiry so they expire
// together. Falls back to 7 days if the token can't be decoded.
function maxAgeFor(refreshToken) {
  const decoded = jwt.decode(refreshToken);
  if (decoded?.exp) return decoded.exp * 1000 - Date.now();
  return 7 * 24 * 60 * 60 * 1000;
}

function baseOptions() {
  return {
    httpOnly: true,
    secure: isProd, // over HTTPS only in production
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
}

export function setRefreshCookie(res, refreshToken) {
  if (!refreshToken) return;
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    maxAge: maxAgeFor(refreshToken),
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}
