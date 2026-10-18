import { useState } from 'react';
import { api } from './client.js';
import { useCooldown } from '../lib/useCooldown.js';

export const RESEND_COOLDOWN_SECONDS = 60; // matches the server's EMAIL_RESEND_COOLDOWN_SECONDS default

/**
 * Sends a new verification email for `email`. The server answers the same whatever the account's state, so
 * `sent` only means the request was accepted. `initialCooldown` is 60 right after a signup, which just sent one.
 */
export function useResendVerification(email, { initialCooldown = 0 } = {}) {
  const cooldown = useCooldown(initialCooldown);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function resend() {
    if (busy || cooldown.remaining > 0) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/resend-verification', { email });
      setSent(true);
      cooldown.start(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setSent(false);
      if (err.response?.status === 429) {
        setError(err.response.data?.error || 'Too many attempts. Try again later.');
        cooldown.start(Number(err.response.headers?.['retry-after']) || RESEND_COOLDOWN_SECONDS);
      } else {
        setError(err.response ? 'We could not send the email. Try again in a moment.' : 'Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }
  return { resend, busy, sent, error, remaining: cooldown.remaining };
}
