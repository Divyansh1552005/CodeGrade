import { useEffect, useState } from 'react';
import { api } from './client.js';

const OFF = { emailVerification: false, passwordReset: false };
let cached;

/** Which email features the server has on (public GET /auth/config). Everything is off until it says so. */
export function useAuthConfig() {
  const [config, setConfig] = useState(cached ?? OFF);
  useEffect(() => {
    if (cached) return undefined;
    let live = true;
    api.get('/auth/config')
      .then(({ data }) => {
        cached = { emailVerification: Boolean(data?.emailVerification), passwordReset: Boolean(data?.passwordReset) };
        if (live) setConfig(cached);
      })
      .catch(() => {}); // an unreachable server just leaves the features hidden
    return () => { live = false; };
  }, []);
  return config;
}

export function resetAuthConfigCache() { cached = undefined; }
