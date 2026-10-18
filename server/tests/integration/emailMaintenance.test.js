import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { createApp } from '../../app.js';
import User from '../../models/User.js';
import EmailToken from '../../models/EmailToken.js';
import WorkItem from '../../models/WorkItem.js';
import { cleanupUnverified, markLegacyUsersVerified } from '../../services/emailMaintenance.js';
import { setMailTransport } from '../../services/mail/mailService.js';

const saved = { ...process.env };
const DAY = 86400000;
const insertRaw = (email, extra = {}, age = 0) => User.collection.insertOne({ name: email, email, passwordHash: 'x', role: 'student', createdAt: new Date(Date.now() - age), updatedAt: new Date(), ...extra });
const find = (email) => User.collection.findOne({ email });

describe('migrateEmailVerified', () => {
  beforeEach(async () => {
    await insertRaw('legacy1@example.com', {}, 30 * DAY);
    await insertRaw('legacy2@example.com', {}, 10 * DAY);
    await insertRaw('pending@example.com', { emailVerified: false });
    await insertRaw('done@example.com', { emailVerified: true, emailVerifiedAt: new Date(0) });
  });
  it('marks only users with no value as verified, dated at their signup', async () => {
    const result = await markLegacyUsersVerified();
    expect(result).toEqual({ dryRun: false, matched: 2, modified: 2 });
    const legacy = await find('legacy1@example.com');
    expect(legacy.emailVerified).toBe(true);
    expect(legacy.emailVerifiedAt).toEqual(legacy.createdAt);
    expect((await find('pending@example.com')).emailVerified).toBe(false);
    expect((await find('done@example.com')).emailVerifiedAt).toEqual(new Date(0));
  });
  it('is safe to run repeatedly', async () => {
    await markLegacyUsersVerified();
    const snapshot = JSON.stringify(await User.collection.find().sort({ email: 1 }).toArray());
    expect(await markLegacyUsersVerified()).toEqual({ dryRun: false, matched: 0, modified: 0 });
    expect(JSON.stringify(await User.collection.find().sort({ email: 1 }).toArray())).toBe(snapshot);
  });
  it('changes nothing in a dry run and reports how many it would change', async () => {
    const snapshot = JSON.stringify(await User.collection.find().sort({ email: 1 }).toArray());
    expect(await markLegacyUsersVerified({ dryRun: true })).toEqual({ dryRun: true, matched: 2, modified: 0 });
    expect(JSON.stringify(await User.collection.find().sort({ email: 1 }).toArray())).toBe(snapshot);
  });
  it('can be imported without running, and refuses to run without a database', () => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', "await import('./scripts/migrateEmailVerified.js'); console.log('imported');"], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } });
    expect(out.trim()).toBe('imported');
    let failure;
    try { execFileSync(process.execPath, ['scripts/migrateEmailVerified.js', '--dry-run'], { encoding: 'utf8', stdio: 'pipe', env: { PATH: process.env.PATH, MONGODB_URI: '' } }); } catch (err) { failure = err; }
    expect(failure.stderr).toMatch(/MONGODB_URI is not set/);
  });
});

describe('cleanupUnverified', () => {
  beforeEach(() => { process.env.FEATURE_EMAIL_VERIFICATION = 'true'; });
  afterEach(() => { process.env = { ...saved }; });
  it('removes stale unverified signups with their tokens and queued emails, and keeps everyone else', async () => {
    const stale = (await insertRaw('stale@example.com', { emailVerified: false }, 8 * DAY)).insertedId;
    await insertRaw('fresh@example.com', { emailVerified: false }, 2 * DAY);
    await insertRaw('verified@example.com', { emailVerified: true }, 30 * DAY);
    await insertRaw('legacy@example.com', {}, 30 * DAY);
    await EmailToken.create({ userId: stale, type: 'verify', tokenId: 't', tokenHash: 'h', expiresAt: new Date(Date.now() + 1e6) });
    await WorkItem.create({ key: 'email-verify-email-t', type: 'send-email', ownerId: stale, payload: { kind: 'verify-email' } });
    expect(await cleanupUnverified()).toEqual({ deleted: 1 });
    expect((await User.find().lean()).map((u) => u.email).sort()).toEqual(['fresh@example.com', 'legacy@example.com', 'verified@example.com']);
    expect(await EmailToken.countDocuments()).toBe(0);
    expect(await WorkItem.countDocuments()).toBe(0);
  });
  it('honours UNVERIFIED_TTL_DAYS', async () => {
    process.env.UNVERIFIED_TTL_DAYS = '1';
    await insertRaw('two-days@example.com', { emailVerified: false }, 2 * DAY);
    expect((await cleanupUnverified()).deleted).toBe(1);
  });
  it('frees the address so the owner can sign up again', async () => {
    process.env.EMAIL_TOKEN_SECRET = 'a-test-secret-that-is-at-least-32-characters';
    process.env.APP_BASE_URL = 'https://app.example.com';
    setMailTransport(async () => ({ id: 'm' }));
    await insertRaw('squatted@example.com', { emailVerified: false }, 8 * DAY);
    await cleanupUnverified();
    const res = await request(createApp()).post('/auth/register').send({ name: 'Real', email: 'squatted@example.com', password: 'password123', role: 'student' });
    expect(res.status).toBe(202);
    expect((await User.findOne({ email: 'squatted@example.com' })).name).toBe('Real');
    setMailTransport(undefined);
  });
  it('does nothing while the verification flag is off', async () => {
    process.env.FEATURE_EMAIL_VERIFICATION = 'false';
    await insertRaw('stale@example.com', { emailVerified: false }, 30 * DAY);
    expect(await cleanupUnverified()).toEqual({ skipped: 'flag_off', deleted: 0 });
    expect(await User.countDocuments()).toBe(1);
  });
});
