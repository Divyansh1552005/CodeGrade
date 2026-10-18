import { expect, it } from 'vitest';
import { PASSWORD_HINT, passwordProblem } from './password.js';

it('accepts 6 characters up to 72 bytes and counts bytes, not characters', () => {
  expect(passwordProblem('12345')).toMatch(/at least 6/);
  expect(passwordProblem('123456')).toBe('');
  expect(passwordProblem('a'.repeat(72))).toBe('');
  expect(passwordProblem('a'.repeat(73))).toMatch(/at most 72 bytes/);
  expect(passwordProblem('é'.repeat(36))).toBe('');
  expect(passwordProblem('é'.repeat(37))).toMatch(/at most 72 bytes/);
});
it('uses the same hint on signup and reset', () => {
  expect(PASSWORD_HINT).toBe('At least 6 characters, at most 72 bytes.');
});
