/**
 * Poll `fn` until it returns a truthy value (or times out). Used to await the
 * background AI-draft processing kicked off by POST /doubts.
 */
export async function waitFor(fn, { timeout = 5000, interval = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // eslint-disable-next-line no-await-in-loop
    const value = await fn();
    if (value) return value;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('waitFor: condition not met within timeout');
}
