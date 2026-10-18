// The password rules the server enforces (validation/schemas.js): at least 6 characters and at most 72
// bytes. The limit is in bytes because bcrypt ignores everything after the 72nd byte, so a character such
// as an accented letter or an emoji counts as more than one.
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters, at most ${PASSWORD_MAX_BYTES} bytes.`;

/** Returns an error message for a password the server would reject, or an empty string. */
export function passwordProblem(password) {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return `Use at most ${PASSWORD_MAX_BYTES} bytes. Accented letters and emoji count as more than one.`;
  return '';
}
