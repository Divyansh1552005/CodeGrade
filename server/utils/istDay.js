// The one definition of "a day" for per-user daily limits: Asia/Kolkata, resetting
// at local midnight. India has used a fixed +05:30 offset with no daylight saving
// since 1945, so plain arithmetic is exact and needs no timezone database.
export const DAY_TIMEZONE = 'Asia/Kolkata';
const OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" in Asia/Kolkata for the given instant. */
export function dayKey(now = Date.now()) {
  return new Date(Number(now) + OFFSET_MS).toISOString().slice(0, 10);
}

/** The next Asia/Kolkata midnight after the given instant, as a Date. */
export function nextResetAt(now = Date.now()) {
  const localMs = Number(now) + OFFSET_MS;
  return new Date((Math.floor(localMs / DAY_MS) + 1) * DAY_MS - OFFSET_MS);
}
