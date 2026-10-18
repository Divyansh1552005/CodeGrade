import { describe, it, expect } from '@jest/globals';
import { assertSafeDatabase } from '../../scripts/perf/seedProfileData.js';

describe('perf seed guard', () => {
  it.each(['test', 'codegrade-test', 'codegrade_local', 'my-dev-db', 'DEV', 'LocalDB'])('allows database %s', (name) => {
    expect(() => assertSafeDatabase(name, { NODE_ENV: 'development' })).not.toThrow();
  });
  it.each(['codegrade', 'production', 'prod-main', '', undefined, 'students'])('refuses database %j', (name) => {
    expect(() => assertSafeDatabase(name, { NODE_ENV: 'development' })).toThrow(/must contain "test", "local" or "dev"/);
  });
  it('refuses everything when NODE_ENV is production, even a test-looking name', () => {
    expect(() => assertSafeDatabase('test', { NODE_ENV: 'production' })).toThrow(/NODE_ENV is production/);
    expect(() => assertSafeDatabase('local-dev', { NODE_ENV: 'Production' })).toThrow(/production/);
  });
  it('allows an unset NODE_ENV on a safe database', () => {
    expect(() => assertSafeDatabase('codegrade-dev', {})).not.toThrow();
  });
});
