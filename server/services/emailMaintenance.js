import User from '../models/User.js';
import EmailToken from '../models/EmailToken.js';
import WorkItem from '../models/WorkItem.js';
import TeacherApplication from '../models/TeacherApplication.js';
import { mailConfig } from '../config/mail.js';
import { logger } from '../utils/logger.js';

/**
 * Accounts that existed before email verification have no `emailVerified` field. Mark them verified so
 * nobody is locked out. Safe to repeat: it only touches users where the field is missing, so a second run
 * matches nothing. `dryRun` counts and changes nothing. Uses the native driver for the pipeline update
 * (emailVerifiedAt becomes the account's createdAt).
 */
export async function markLegacyUsersVerified({ dryRun = false } = {}) {
  const filter = { emailVerified: { $exists: false } };
  if (dryRun) return { dryRun: true, matched: await User.collection.countDocuments(filter), modified: 0 };
  const result = await User.collection.updateMany(filter, [{ $set: { emailVerified: true, emailVerifiedAt: '$createdAt' } }]);
  return { dryRun: false, matched: result.matchedCount, modified: result.modifiedCount };
}

/**
 * Delete signups that never verified within UNVERIFIED_TTL_DAYS, with their tokens and queued emails, so a
 * pending signup does not hold an address forever. Only users whose emailVerified is exactly false are
 * touched.
 */
export async function cleanupUnverified({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - mailConfig().unverifiedTtlMs);
  let deleted = 0;
  for (;;) {
    const batch = await User.find({ emailVerified: false, createdAt: { $lt: cutoff } }).select('_id').limit(500).lean();
    if (!batch.length) break;
    const ids = batch.map((user) => user._id);
    await EmailToken.deleteMany({ userId: { $in: ids } });
    await WorkItem.deleteMany({ type: 'send-email', ownerId: { $in: ids } });
    await TeacherApplication.deleteMany({ userId: { $in: ids } });
    const result = await User.deleteMany({ _id: { $in: ids }, emailVerified: false });
    deleted += result.deletedCount;
    if (result.deletedCount === 0) break;
  }
  if (deleted) logger.info('email.unverified_cleanup', { deleted });
  return { deleted };
}
