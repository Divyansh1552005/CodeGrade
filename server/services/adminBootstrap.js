import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { adminConfig, validateAdminConfig } from './adminConfig.js';
import { revokeAllSessions } from './tokenService.js';
import { audit } from './audit.js';
import TeacherApplication from '../models/TeacherApplication.js';
import { logger } from '../utils/logger.js';

const name = 'Administrator';

/** Remove the privileges of a former admin: back to a student, every session ended. */
async function demote(user, reason) {
  await User.updateOne({ _id: user._id }, { $set: { role: 'student' }, $unset: { envAdmin: 1 } });
  await revokeAllSessions(user._id);
  await audit({ action: 'admin.demoted', target: user, before: { role: user.role }, after: { role: 'student' }, detail: reason });
}

/**
 * Makes the account named by ADMIN_EMAIL the one admin, from ADMIN_EMAIL and ADMIN_PASSWORD. Runs once at API
 * startup (never in the worker, never per request) and is safe to repeat.
 *  1. The target account is created or promoted FIRST (verified, role admin, password hash matching the env).
 *  2. Only then is any other admin demoted, so the system never has zero admins.
 *  3. The target is finally marked as the env admin.
 * A changed password revokes the admin's sessions. The password is only ever compared and hashed, never
 * stored or logged. With no ADMIN_EMAIL it leaves an existing admin alone and only warns.
 */
export async function bootstrapAdmin(env = process.env) {
  const { config, warnings } = validateAdminConfig(env);
  for (const warning of warnings) logger.warn('admin.config', { warning });
  if (!config.email) return { skipped: 'no_admin_email' };

  let target = await User.findOne({ email: config.email });
  let created = false;
  let promoted = false;
  if (!target) {
    try {
      target = await User.create({
        name, email: config.email, passwordHash: await bcrypt.hash(config.password, 10), role: 'admin',
        emailVerified: true, emailVerifiedAt: new Date(),
      });
      created = true;
    } catch (err) {
      if (err.code !== 11000) throw err;
      target = await User.findOne({ email: config.email }); // another instance created it a moment ago
    }
  }

  const formerRole = target.role;
  let passwordChanged = false;
  if (!created) {
    promoted = target.role !== 'admin';
    const matches = !promoted && (await bcrypt.compare(config.password, target.passwordHash));
    if (promoted || !matches) {
      // A promoted account always gets the env password, so nobody keeps a password they chose earlier.
      await User.updateOne({ _id: target._id }, {
        $set: { role: 'admin', passwordHash: await bcrypt.hash(config.password, 10), emailVerified: true, emailVerifiedAt: target.emailVerifiedAt ?? new Date() },
        $unset: { suspendedAt: 1, suspendedBy: 1, teacherApprovedAt: 1 },
      });
      await revokeAllSessions(target._id);
      if (promoted) await TeacherApplication.deleteOne({ userId: target._id }); // an admin has no use for a pending application
      passwordChanged = !promoted;
    } else if (target.emailVerified !== true || target.suspendedAt) {
      await User.updateOne({ _id: target._id }, { $set: { emailVerified: true }, $unset: { suspendedAt: 1, suspendedBy: 1 } });
    }
  }
  if (created || promoted) {
    await audit({ action: 'admin.bootstrapped', target, before: created ? undefined : { role: formerRole }, after: { role: 'admin' }, detail: created ? 'created' : 'promoted' });
  } else if (passwordChanged) {
    await audit({ action: 'admin.password_changed', target, detail: 'ADMIN_PASSWORD changed' });
  }

  // The new admin exists; now there must be only one.
  const others = await User.find({ _id: { $ne: target._id }, $or: [{ role: 'admin' }, { envAdmin: true }] });
  for (const other of others) await demote(other, other.envAdmin ? 'ADMIN_EMAIL changed' : 'not the configured admin');
  if (!target.envAdmin) await User.updateOne({ _id: target._id }, { $set: { envAdmin: true } });
  return { created, promoted, passwordChanged, demoted: others.length };
}

export { adminConfig };
