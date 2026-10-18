// How many times, and how far apart, each kind of work is retried. Most work uses the default.
// Email gets more attempts and a longer wait: a provider outage usually lasts longer than a few seconds.
const DEFAULT_POLICY = { attempts: 3, delay: 5000 };
const POLICIES = { 'send-email': { attempts: 5, delay: 10000 } };

export const retryPolicy = (type) => POLICIES[type] ?? DEFAULT_POLICY;
