import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UnrecoverableError } from 'bullmq';
import User from '../../models/User.js';
import EmailToken from '../../models/EmailToken.js';
import WorkItem from '../../models/WorkItem.js';
import { consumeToken, deriveToken, isTokenActive, issueToken, mayIssue } from '../../services/emailTokens.js';
import { queueEmail } from '../../services/emailJob.js';
import { processWork } from '../../services/workProcessor.js';
import { MailError, setMailTransport } from '../../services/mail/mailService.js';

process.env.EMAIL_TOKEN_SECRET = 'a-test-secret-that-is-at-least-32-characters';
process.env.APP_BASE_URL = 'https://app.example.com';
process.env.MAIL_FROM = 'CodeGrade <no-reply@example.com>';

const transport = jest.fn();
let user;
beforeEach(async () => {
  transport.mockReset().mockResolvedValue({ id: 'msg_1' });
  setMailTransport(transport);
  user = await User.create({ name: 'Ada', email: 'ada@example.com', passwordHash: 'x', role: 'student', emailVerified: false });
});
const run = async (work, attemptsMade = 0, attempts = 5) => processWork({ data: { workItemId: work.id }, attemptsMade, opts: { attempts } });
const queueVerify = async () => {
  const tokenId = await issueToken(user._id, 'verify');
  return { tokenId, work: await queueEmail({ kind: 'verify-email', userId: user._id, tokenId }) };
};

describe('email tokens', () => {
  it('store only the hash and the id: no document or job payload contains the token', async () => {
    const { tokenId, work } = await queueVerify();
    const token = deriveToken(tokenId);
    expect(token).toHaveLength(43);
    const stored = JSON.stringify(await EmailToken.find().lean()) + JSON.stringify(await WorkItem.find().lean());
    expect(stored).not.toContain(token);
    expect(work.payload).toEqual({ kind: 'verify-email', userId: String(user._id), ref: tokenId });
  });
  it('can be used once, and not when tampered with, expired or of the other type', async () => {
    const tokenId = await issueToken(user._id, 'verify');
    const token = deriveToken(tokenId);
    expect(await consumeToken(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, 'verify')).toBeNull();
    expect(await consumeToken('short', 'verify')).toBeNull();
    expect(await consumeToken(token, 'reset')).toBeNull();
    expect(await consumeToken(token, 'verify')).toMatchObject({ userId: user._id });
    expect(await consumeToken(token, 'verify')).toBeNull();
    const expiredId = await issueToken(user._id, 'reset');
    await EmailToken.updateOne({ tokenId: expiredId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeToken(deriveToken(expiredId), 'reset')).toBeNull();
  });
  it('let only one of several parallel requests with the same token succeed', async () => {
    const token = deriveToken(await issueToken(user._id, 'verify'));
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeToken(token, 'verify')));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it('retire older tokens of the same kind when a new one is issued, but not tokens of the other kind', async () => {
    const first = await issueToken(user._id, 'verify');
    const reset = await issueToken(user._id, 'reset');
    const second = await issueToken(user._id, 'verify');
    expect(await consumeToken(deriveToken(first), 'verify')).toBeNull();
    expect(await isTokenActive(user._id, 'verify', second)).toBe(true);
    expect(await isTokenActive(user._id, 'reset', reset)).toBe(true);
  });
  it('enforce the cooldown and the hourly cap per account from the stored rows', async () => {
    expect(await mayIssue(user._id, 'verify')).toBe(true);
    await issueToken(user._id, 'verify');
    expect(await mayIssue(user._id, 'verify')).toBe(false); // inside the 60 second cooldown
    await EmailToken.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 120000) } }); // createdAt is immutable through mongoose
    expect(await mayIssue(user._id, 'verify')).toBe(true);
    for (let i = 0; i < 4; i += 1) await EmailToken.create({ userId: user._id, type: 'verify', tokenId: `t${i}`, tokenHash: `h${i}`, expiresAt: new Date(Date.now() + 1e6), createdAt: new Date(Date.now() - 120000) });
    expect(await mayIssue(user._id, 'verify')).toBe(false); // 5 in the last hour
  });
});

describe('send-email job', () => {
  it('sends once to the account address with a link built from APP_BASE_URL and the work key as idempotency key', async () => {
    const { tokenId, work } = await queueVerify();
    await run(work);
    expect(transport).toHaveBeenCalledTimes(1);
    const sent = transport.mock.calls[0][0];
    expect(sent.to).toBe('ada@example.com');
    expect(sent.idempotencyKey).toBe(`email-verify-email-${tokenId}`);
    expect(sent.html).toContain(`https://app.example.com/verify-email?token=${deriveToken(tokenId)}`);
    expect(sent.tags).toEqual([{ name: 'type', value: 'verify_email' }]);
    expect((await WorkItem.findById(work.id)).status).toBe('completed');
    await run(work); // a replay of a completed job sends nothing
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('is queued once per token however many times it is recorded', async () => {
    const { tokenId } = await queueVerify();
    await queueEmail({ kind: 'verify-email', userId: user._id, tokenId });
    expect(await WorkItem.countDocuments({ type: 'send-email' })).toBe(1);
  });
  it.each([[500, 'internal_server_error'], [429, 'rate_limit_exceeded']])('retries a %s from the provider and reuses the idempotency key', async (status, code) => {
    const { work } = await queueVerify();
    transport.mockRejectedValueOnce(new MailError('down', { permanent: false, status, code }));
    await expect(run(work, 0)).rejects.toMatchObject({ status });
    expect((await WorkItem.findById(work.id)).status).toBe('queued');
    await run(work, 1);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1][0].idempotencyKey).toBe(transport.mock.calls[0][0].idempotencyKey);
    expect((await WorkItem.findById(work.id)).status).toBe('completed');
  });
  it('gives up after five attempts', async () => {
    const { work } = await queueVerify();
    transport.mockRejectedValue(new MailError('down', { permanent: false, status: 503 }));
    await expect(run(work, 4)).rejects.toThrow();
    expect((await WorkItem.findById(work.id)).status).toBe('failed');
  });
  it('does not retry a permanent provider rejection', async () => {
    const { work } = await queueVerify();
    transport.mockRejectedValue(new MailError('bad', { permanent: true, status: 422 }));
    await expect(run(work, 0)).rejects.toBeInstanceOf(UnrecoverableError);
    const after = await WorkItem.findById(work.id);
    expect(after.status).toBe('failed');
    expect(after.attempts).toBe(1);
  });
  it.each([
    ['the user no longer exists', async () => { await User.deleteOne({ _id: user._id }); }],
    ['the account is already verified', async () => { await User.updateOne({ _id: user._id }, { emailVerified: true }); }],
    ['the token was already used', async (tokenId) => { await consumeToken(deriveToken(tokenId), 'verify'); }],
    ['the token was superseded', async () => { await issueToken(user._id, 'verify'); }],
    ['the token expired', async (tokenId) => { await EmailToken.updateOne({ tokenId }, { expiresAt: new Date(Date.now() - 1000) }); }],
  ])('skips and completes when %s', async (_name, change) => {
    const { tokenId, work } = await queueVerify();
    await change(tokenId);
    const result = await run(work);
    expect(result.skipped).toBeDefined();
    expect(transport).not.toHaveBeenCalled();
    expect((await WorkItem.findById(work.id)).status).toBe('completed');
  });
  it('sends the notice emails without a token and passes the resubmitted wording through', async () => {
    const changed = await queueEmail({ kind: 'password-changed', userId: user._id });
    await run(changed);
    expect(transport.mock.calls[0][0].subject).toBe('Your CodeGrade password was changed');
    const tokenId = await issueToken(user._id, 'verify');
    const again = await queueEmail({ kind: 'verify-email', userId: user._id, tokenId, resubmitted: true });
    await run(again);
    expect(transport.mock.calls[1][0].text).toContain('A new signup request was submitted for this email address');
  });
  it('skips a reset email whose token was already used', async () => {
    await User.updateOne({ _id: user._id }, { emailVerified: true });
    const tokenId = await issueToken(user._id, 'reset');
    const work = await queueEmail({ kind: 'password-reset', userId: user._id, tokenId });
    await consumeToken(deriveToken(tokenId), 'reset');
    expect((await run(work)).skipped).toBe('token_inactive');
  });
});
